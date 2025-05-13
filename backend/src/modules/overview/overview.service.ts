import { Injectable } from '@nestjs/common';
import { EmployeeStatus, LeaveStatus } from '@prisma/client';
import { addDays, startOfMonth } from 'date-fns';
import { PrismaService } from '../../core/database/prisma.service';
import { ScopeService } from '../../core/access/scope.service';
import { TenantContext, requireTenant } from '../../core/tenant/tenant-context';
import { AttendanceService } from '../attendance/attendance.service';
import { toCalendarDate } from '../leave/working-days.service';

/**
 * Dashboard aggregates.
 *
 * Returns *data*, not presentation strings. The previous backend sent UI copy
 * like "Active employees" and "Review it" in the payload, which meant changing a
 * label required a backend deploy and the API dictated wording it has no view
 * into. Numbers here, wording in the Angular templates.
 */
@Injectable()
export class OverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly attendance: AttendanceService
  ) {}

  async stats(context: TenantContext = requireTenant()) {
    const employeeScope = this.scope.employeeScope(context);
    const today = toCalendarDate(new Date());

    const [attendanceToday, counts] = await Promise.all([
      this.attendance.todaySummary(context),
      this.prisma.withTenant(async tx => {
        const [headcount, joinedThisMonth, onLeaveToday, pendingApprovals] = await Promise.all([
          tx.employee.count({
            where: { AND: [employeeScope, { status: { not: EmployeeStatus.DEACTIVATED } }] },
          }),
          tx.employee.count({
            where: { AND: [employeeScope, { startDate: { gte: startOfMonth(new Date()) } }] },
          }),
          tx.leaveRequest.count({
            where: {
              employee: employeeScope,
              status: LeaveStatus.APPROVED,
              startDate: { lte: today },
              endDate: { gte: today },
            },
          }),
          // What is sitting in *this* user's queue, not the company's total —
          // the dashboard's job is to tell them what they personally must action.
          tx.leaveRequest.count({
            where: {
              employee: employeeScope,
              status: { in: this.pendingStatusesFor(context) },
            },
          }),
        ]);

        return { headcount, joinedThisMonth, onLeaveToday, pendingApprovals };
      }, context),
    ]);

    return {
      totalEmployees: {
        value: counts.headcount,
        joinedThisMonth: counts.joinedThisMonth,
      },
      attendance: {
        clockedIn: attendanceToday.clockedIn,
        total: attendanceToday.headcount,
        percentage: attendanceToday.attendanceRate,
        notClockedIn: attendanceToday.notClockedIn,
        late: attendanceToday.late,
        missingClockOut: attendanceToday.missingClockOut,
      },
      onLeave: {
        count: counts.onLeaveToday,
        total: counts.headcount,
        percentage:
          counts.headcount === 0 ? 0 : Math.round((counts.onLeaveToday / counts.headcount) * 100),
      },
      pendingApprovals: counts.pendingApprovals,
    };
  }

  /** Recent activity feed, read straight off the audit log. */
  async activity(context: TenantContext = requireTenant()) {
    const entries = await this.prisma.auditLog.findMany({
      where: {
        companyId: context.companyId,
        // Only actions a human would recognise as activity — not every read.
        action: {
          in: [
            'EMPLOYEE_CREATED',
            'EMPLOYEE_UPDATED',
            'EMPLOYEE_DEACTIVATED',
            'LEAVE_REQUESTED',
            'LEAVE_APPROVED',
            'LEAVE_REJECTED',
            'LEAVE_AUTO_ESCALATED',
            'ATTENDANCE_CORRECTION_APPROVED',
            'PAYSLIP_UPLOADED',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        action: true,
        actorEmail: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    });

    return entries.map(entry => ({
      id: entry.id,
      action: entry.action,
      actorEmail: entry.actorEmail,
      /** True when the current user did it, so the UI can say "You". */
      isSelf: entry.actorEmail === context.email,
      entityType: entry.entityType,
      entityId: entry.entityId,
      occurredAt: entry.createdAt,
    }));
  }

  /**
   * Upcoming events: public holidays and month-end payroll, next 60 days.
   *
   * Payroll date is derived rather than stored — payslip *upload* is in scope but
   * payroll processing is explicitly not (PRD §5.3), so there is no payroll run
   * to read a date from.
   */
  async events(context: TenantContext = requireTenant()) {
    const from = toCalendarDate(new Date());
    const to = addDays(from, 60);

    const holidays = await this.prisma.withTenant(
      tx =>
        tx.publicHoliday.findMany({
          where: { date: { gte: from, lte: to } },
          orderBy: { date: 'asc' },
        }),
      context
    );

    const events = holidays.map(holiday => ({
      id: holiday.id,
      title: holiday.name,
      date: holiday.date,
      type: 'holiday' as const,
    }));

    const payrollDate = lastDayOfMonth(from);
    if (payrollDate >= from && payrollDate <= to) {
      events.push({
        id: `payroll-${payrollDate.toISOString().slice(0, 7)}`,
        title: 'Payroll processing',
        date: payrollDate,
        type: 'payroll' as const,
      });
    }

    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Who is in the caller's approval queue right now.
   *
   * Roles are not cumulative, so each gets exactly the statuses it owns rather
   * than everything at or below a level.
   */
  private pendingStatusesFor(context: TenantContext): LeaveStatus[] {
    switch (context.role) {
      case 'LINE_MANAGER':
        return [LeaveStatus.PENDING_LINE_MANAGER];
      case 'LOCAL_HR_MANAGER':
        return [LeaveStatus.PENDING_HR];
      case 'GROUP_HR_MANAGER':
        return [LeaveStatus.PENDING_GROUP_HR];
      default:
        // An employee has no queue; show them their own outstanding requests.
        return [LeaveStatus.PENDING_LINE_MANAGER, LeaveStatus.PENDING_HR, LeaveStatus.PENDING_GROUP_HR];
    }
  }
}

function lastDayOfMonth(reference: Date): Date {
  return new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
}
