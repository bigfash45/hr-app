import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, CorrectionStatus, Prisma } from '@prisma/client';
import { differenceInMinutes, subDays } from 'date-fns';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { ScopeService } from '../../core/access/scope.service';
import { TenantContext, requireTenant } from '../../core/tenant/tenant-context';
import { toCalendarDate } from '../leave/working-days.service';
import {
  DecideCorrectionDto,
  ListAttendanceQueryDto,
  ManualAttendanceDto,
  RequestCorrectionDto,
} from './attendance.dto';

/** Corrections may only be raised for the last 7 days (PRD §6.4). */
const CORRECTION_WINDOW_DAYS = 7;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService
  ) {}

  /**
   * Clock in (PRD §6.4).
   *
   * Late is decided against the company's own start time plus its grace period,
   * not a hardcoded 09:00 — PRD §6.2 lets each company set both.
   *
   * IP and user agent are recorded for the audit trail. They are not
   * verification: browser clock-in remains open to buddy-clocking (PRD §16.2),
   * and pretending otherwise would be worse than acknowledging it.
   */
  async clockIn(context: TenantContext = requireTenant()) {
    const employeeId = this.requireEmployee(context);

    return this.prisma.withTenant(async tx => {
      const company = await tx.company.findUniqueOrThrow({
        where: { id: context.companyId },
        select: { workdayStart: true, graceMinutes: true, workingDays: true },
      });

      const now = new Date();
      const workDate = toCalendarDate(now);

      const existing = await tx.attendanceRecord.findUnique({
        where: { employeeId_workDate: { employeeId, workDate } },
      });

      if (existing?.clockInAt) {
        // A 409 the client renders inline, rather than a duplicate row.
        throw new BadRequestException(
          `You already clocked in today at ${formatTime(existing.clockInAt)}.`
        );
      }

      const isLate = this.isLate(now, company.workdayStart, company.graceMinutes);
      const status = isLate ? AttendanceStatus.PRESENT_LATE : AttendanceStatus.PRESENT;

      const record = await tx.attendanceRecord.upsert({
        where: { employeeId_workDate: { employeeId, workDate } },
        create: {
          companyId: context.companyId,
          employeeId,
          workDate,
          clockInAt: now,
          status,
          clockInIp: context.ipAddress,
          clockInUserAgent: context.userAgent,
        },
        update: {
          clockInAt: now,
          status,
          clockInIp: context.ipAddress,
          clockInUserAgent: context.userAgent,
        },
      });

      return { ...record, isLate };
    }, context);
  }

  async clockOut(context: TenantContext = requireTenant()) {
    const employeeId = this.requireEmployee(context);
    const workDate = toCalendarDate(new Date());

    return this.prisma.withTenant(async tx => {
      const record = await tx.attendanceRecord.findUnique({
        where: { employeeId_workDate: { employeeId, workDate } },
      });

      if (!record?.clockInAt) {
        throw new BadRequestException('You have not clocked in today.');
      }
      if (record.clockOutAt) {
        throw new BadRequestException(
          `You already clocked out today at ${formatTime(record.clockOutAt)}.`
        );
      }

      return tx.attendanceRecord.update({
        where: { id: record.id },
        data: { clockOutAt: new Date(), clockOutIp: context.ipAddress },
      });
    }, context);
  }

  /** Drives the clock-in widget: am I in, out, or not started? */
  async todayForCurrentUser(context: TenantContext = requireTenant()) {
    const employeeId = context.employeeId;
    if (!employeeId) return { clockedIn: false, record: null };

    const record = await this.prisma.withTenant(
      tx =>
        tx.attendanceRecord.findUnique({
          where: { employeeId_workDate: { employeeId, workDate: toCalendarDate(new Date()) } },
        }),
      context
    );

    return {
      clockedIn: Boolean(record?.clockInAt && !record.clockOutAt),
      clockedOut: Boolean(record?.clockOutAt),
      record,
    };
  }

  /**
   * History, scoped by role: own records, the team's, the company's, or the
   * group's (PRD §6.4).
   */
  async list(query: ListAttendanceQueryDto, context: TenantContext = requireTenant()) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 31;

    const where: Prisma.AttendanceRecordWhereInput = {
      AND: [
        { employee: this.scope.employeeScope(context) },
        query.employeeId ? { employeeId: query.employeeId } : {},
        query.status ? { status: query.status } : {},
        query.from ? { workDate: { gte: toCalendarDate(query.from) } } : {},
        query.to ? { workDate: { lte: toCalendarDate(query.to) } } : {},
      ],
    };

    return this.prisma.withTenant(async tx => {
      const [total, rows] = await Promise.all([
        tx.attendanceRecord.count({ where }),
        tx.attendanceRecord.findMany({
          where,
          orderBy: [{ workDate: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            employee: {
              select: { id: true, firstName: true, lastName: true, jobTitle: true, photoUrl: true },
            },
          },
        }),
      ]);

      return {
        items: rows.map(row => ({
          id: row.id,
          workDate: row.workDate,
          clockInAt: row.clockInAt,
          clockOutAt: row.clockOutAt,
          status: row.status,
          hoursWorked: hoursBetween(row.clockInAt, row.clockOutAt),
          isManualEntry: row.isManualEntry,
          employee: row.employee,
        })),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      };
    }, context);
  }

  /** Today's roll-call — who is in, late, on leave, or missing. */
  async todaySummary(context: TenantContext = requireTenant()) {
    const workDate = toCalendarDate(new Date());

    return this.prisma.withTenant(async tx => {
      const scope = this.scope.employeeScope(context);

      const [headcount, records] = await Promise.all([
        tx.employee.count({ where: { AND: [scope, { status: { not: 'DEACTIVATED' } }] } }),
        tx.attendanceRecord.findMany({
          where: { workDate, employee: scope },
          select: { status: true, clockInAt: true, clockOutAt: true },
        }),
      ]);

      const byStatus = (status: AttendanceStatus) => records.filter(r => r.status === status).length;

      const present = byStatus(AttendanceStatus.PRESENT);
      const late = byStatus(AttendanceStatus.PRESENT_LATE);
      const clockedIn = present + late;

      return {
        workDate,
        headcount,
        clockedIn,
        present,
        late,
        onLeave: byStatus(AttendanceStatus.ON_LEAVE),
        workFromHome: byStatus(AttendanceStatus.WORK_FROM_HOME),
        // Anyone with no record at all today. This is the number HR chases.
        notClockedIn: Math.max(0, headcount - records.length),
        missingClockOut: records.filter(r => r.clockInAt && !r.clockOutAt).length,
        attendanceRate: headcount === 0 ? 0 : Math.round((clockedIn / headcount) * 100),
      };
    }, context);
  }

  /** Raise a correction request — last 7 days only, routes to the Line Manager. */
  async requestCorrection(dto: RequestCorrectionDto, context: TenantContext = requireTenant()) {
    const employeeId = this.requireEmployee(context);

    const correction = await this.prisma.withTenant(async tx => {
      const record = await tx.attendanceRecord.findUnique({
        where: { id: dto.attendanceRecordId },
      });
      if (!record) throw new NotFoundException('Attendance record not found');

      if (record.employeeId !== employeeId) {
        throw new ForbiddenException('You can only request corrections on your own records.');
      }

      if (record.workDate < toCalendarDate(subDays(new Date(), CORRECTION_WINDOW_DAYS))) {
        throw new BadRequestException(
          `Corrections can only be requested within ${CORRECTION_WINDOW_DAYS} days. Ask your HR Manager to amend this record.`
        );
      }

      const alreadyPending = await tx.attendanceCorrection.findFirst({
        where: { attendanceRecordId: record.id, status: CorrectionStatus.PENDING },
      });
      if (alreadyPending) {
        throw new BadRequestException('A correction for this day is already awaiting review.');
      }

      return tx.attendanceCorrection.create({
        data: {
          companyId: context.companyId,
          attendanceRecordId: record.id,
          requestedById: employeeId,
          requestedClockIn: dto.requestedClockIn ? new Date(dto.requestedClockIn) : null,
          requestedClockOut: dto.requestedClockOut ? new Date(dto.requestedClockOut) : null,
          requestedStatus: dto.requestedStatus ?? null,
          reason: dto.reason,
        },
      });
    }, context);

    await this.audit.record(
      {
        action: 'ATTENDANCE_CORRECTION_REQUESTED',
        entityType: 'AttendanceCorrection',
        entityId: correction.id,
        reason: dto.reason,
      },
      context
    );

    return correction;
  }

  /** Line Manager or HR decides. Approving writes the change onto the record. */
  async decideCorrection(id: string, dto: DecideCorrectionDto, context: TenantContext = requireTenant()) {
    const result = await this.prisma.withTenant(async tx => {
      const correction = await tx.attendanceCorrection.findUnique({
        where: { id },
        include: { attendanceRecord: true, requestedBy: { select: { id: true, managerId: true } } },
      });
      if (!correction) throw new NotFoundException('Correction request not found');
      if (correction.status !== CorrectionStatus.PENDING) {
        throw new BadRequestException('This correction has already been reviewed.');
      }

      // Nobody reviews their own correction (PRD §7.3).
      this.scope.assertNotSelfApproval(correction.requestedById, context);

      const isManager = context.employeeId === correction.requestedBy.managerId;
      const isHr = context.role === 'LOCAL_HR_MANAGER' || context.role === 'GROUP_HR_MANAGER';
      if (!isManager && !isHr) {
        throw new ForbiddenException('Only the line manager or an HR Manager can review this.');
      }

      await tx.attendanceCorrection.update({
        where: { id },
        data: {
          status: dto.approve ? CorrectionStatus.APPROVED : CorrectionStatus.REJECTED,
          reviewedById: context.employeeId,
          reviewedAt: new Date(),
          reviewNote: dto.note ?? null,
        },
      });

      if (!dto.approve) return { id, approved: false };

      await tx.attendanceRecord.update({
        where: { id: correction.attendanceRecordId },
        data: {
          ...(correction.requestedClockIn ? { clockInAt: correction.requestedClockIn } : {}),
          ...(correction.requestedClockOut ? { clockOutAt: correction.requestedClockOut } : {}),
          ...(correction.requestedStatus ? { status: correction.requestedStatus } : {}),
          isManualEntry: true,
          manualReason: `Correction approved: ${correction.reason}`,
          manualBy: context.employeeId,
        },
      });

      return { id, approved: true };
    }, context);

    await this.audit.record(
      {
        action: result.approved ? 'ATTENDANCE_CORRECTION_APPROVED' : 'ATTENDANCE_CORRECTION_REJECTED',
        entityType: 'AttendanceCorrection',
        entityId: id,
        reason: dto.note ?? null,
      },
      context
    );

    return result;
  }

  async listCorrections(context: TenantContext = requireTenant()) {
    return this.prisma.withTenant(
      tx =>
        tx.attendanceCorrection.findMany({
          where: { requestedBy: this.scope.employeeScope(context) },
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            attendanceRecord: { select: { workDate: true, clockInAt: true, clockOutAt: true, status: true } },
            requestedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        }),
      context
    );
  }

  /**
   * HR marks or edits a record directly (PRD §6.4) — WFH, an absence, a fix.
   * The justification is mandatory because it goes to the audit log.
   */
  async manualEntry(dto: ManualAttendanceDto, context: TenantContext = requireTenant()) {
    const workDate = toCalendarDate(dto.workDate);

    const record = await this.prisma.withTenant(async tx => {
      const employee = await tx.employee.findUnique({
        where: { id: dto.employeeId },
        select: { id: true },
      });
      if (!employee) throw new NotFoundException('Employee not found');

      return tx.attendanceRecord.upsert({
        where: { employeeId_workDate: { employeeId: dto.employeeId, workDate } },
        create: {
          companyId: context.companyId,
          employeeId: dto.employeeId,
          workDate,
          status: dto.status,
          clockInAt: dto.clockInAt ? new Date(dto.clockInAt) : null,
          clockOutAt: dto.clockOutAt ? new Date(dto.clockOutAt) : null,
          isManualEntry: true,
          manualReason: dto.reason,
          manualBy: context.employeeId,
        },
        update: {
          status: dto.status,
          ...(dto.clockInAt ? { clockInAt: new Date(dto.clockInAt) } : {}),
          ...(dto.clockOutAt ? { clockOutAt: new Date(dto.clockOutAt) } : {}),
          isManualEntry: true,
          manualReason: dto.reason,
          manualBy: context.employeeId,
        },
      });
    }, context);

    await this.audit.record(
      {
        action: 'ATTENDANCE_MANUALLY_SET',
        entityType: 'AttendanceRecord',
        entityId: record.id,
        reason: dto.reason,
        changes: { status: dto.status, workDate },
      },
      context
    );

    return record;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private requireEmployee(context: TenantContext): string {
    if (!context.employeeId) {
      throw new BadRequestException(
        'Your account is not linked to an employee record, so attendance cannot be recorded.'
      );
    }
    return context.employeeId;
  }

  /** Compares clock-in against the company start time plus grace period. */
  private isLate(now: Date, workdayStart: string, graceMinutes: number): boolean {
    const [hours, minutes] = workdayStart.split(':').map(Number);
    const cutoff = new Date(now);
    cutoff.setHours(hours ?? 8, (minutes ?? 0) + graceMinutes, 0, 0);
    return now > cutoff;
  }
}

function hoursBetween(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  return Math.round((differenceInMinutes(to, from) / 60) * 100) / 100;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-NG', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}
