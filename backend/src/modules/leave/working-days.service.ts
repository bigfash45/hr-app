import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { TenantContext, requireTenant } from '../../core/tenant/tenant-context';

/**
 * Working-day arithmetic — PRD §6.5 requires leave to exclude weekends and
 * public holidays.
 *
 * Two things this deliberately does NOT do:
 *
 *  - trust the client's day count. The Angular form shows a live figure for
 *    feedback, but the number that reaches a balance is always recomputed here.
 *    Otherwise the count is a user-editable field on someone's leave allowance.
 *
 *  - use UTC. Dates are handled as plain calendar dates in the company's
 *    timezone. A leave day is "the 3rd of March", not an instant — and in WAT
 *    (UTC+1) naive UTC handling shifts every date back a day for anyone
 *    applying in the evening.
 */
@Injectable()
export class WorkingDaysService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Working days between two dates, inclusive of both ends.
   *
   * Uses the company's configured working days (default Mon-Fri) rather than a
   * hardcoded weekend, since PRD §6.2 lets each company set its own.
   */
  async countWorkingDays(
    startDate: Date,
    endDate: Date,
    context: TenantContext = requireTenant()
  ): Promise<{ workingDays: number; holidays: { date: Date; name: string }[] }> {
    const start = toCalendarDate(startDate);
    const end = toCalendarDate(endDate);

    if (end < start) {
      return { workingDays: 0, holidays: [] };
    }

    const { workingDays: companyWorkingDays, holidays } = await this.prisma.withTenant(
      async tx => {
        const company = await tx.company.findUnique({
          where: { id: context.companyId },
          select: { workingDays: true },
        });

        const rows = await tx.publicHoliday.findMany({
          where: { date: { gte: start, lte: end } },
          select: { date: true, name: true },
        });

        return { workingDays: company?.workingDays ?? [1, 2, 3, 4, 5], holidays: rows };
      },
      context
    );

    const holidayKeys = new Set(holidays.map(h => toCalendarDate(h.date).getTime()));
    const workingDaySet = new Set(companyWorkingDays);

    let count = 0;
    const observed: { date: Date; name: string }[] = [];

    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      // getDay() is 0=Sunday; the schema stores ISO weekdays where 1=Monday and
      // 7=Sunday, so Sunday needs mapping rather than a straight comparison.
      const isoWeekday = cursor.getDay() === 0 ? 7 : cursor.getDay();
      if (!workingDaySet.has(isoWeekday)) continue;

      if (holidayKeys.has(cursor.getTime())) {
        const match = holidays.find(h => toCalendarDate(h.date).getTime() === cursor.getTime());
        if (match) observed.push({ date: new Date(cursor), name: match.name });
        continue;
      }

      count += 1;
    }

    return { workingDays: count, holidays: observed };
  }

  /** Does this range overlap any leave the employee already has booked? */
  async findOverlapping(
    employeeId: string,
    startDate: Date,
    endDate: Date,
    excludeRequestId: string | null = null,
    context: TenantContext = requireTenant()
  ) {
    return this.prisma.withTenant(
      tx =>
        tx.leaveRequest.findFirst({
          where: {
            employeeId,
            id: excludeRequestId ? { not: excludeRequestId } : undefined,
            // Cancelled and rejected requests do not block a new one.
            status: { in: ['PENDING_LINE_MANAGER', 'PENDING_HR', 'PENDING_GROUP_HR', 'APPROVED'] },
            // Two ranges overlap when each starts before the other ends.
            startDate: { lte: toCalendarDate(endDate) },
            endDate: { gte: toCalendarDate(startDate) },
          },
          select: { id: true, startDate: true, endDate: true, status: true },
        }),
      context
    );
  }

  /**
   * Days actually available: entitlement plus carry-over and adjustments, less
   * what is used and what is already spoken for by pending requests.
   *
   * Counting pending days matters — without it someone could submit five
   * overlapping requests against a balance that only covers one, and each would
   * pass its own check.
   */
  availableDays(balance: {
    entitledDays: Prisma.Decimal;
    carriedOverDays: Prisma.Decimal;
    adjustmentDays: Prisma.Decimal;
    usedDays: Prisma.Decimal;
    pendingDays: Prisma.Decimal;
  }): number {
    return (
      Number(balance.entitledDays) +
      Number(balance.carriedOverDays) +
      Number(balance.adjustmentDays) -
      Number(balance.usedDays) -
      Number(balance.pendingDays)
    );
  }
}

/** Strip the time component so comparisons are date-only. */
export function toCalendarDate(value: Date | string): Date {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
