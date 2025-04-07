import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalLevel, LeaveStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { ScopeService } from '../../core/access/scope.service';
import { TenantContext, requireTenant } from '../../core/tenant/tenant-context';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkingDaysService, toCalendarDate } from './working-days.service';
import { AdjustBalanceDto, ApplyLeaveDto, DecideLeaveDto, ListLeaveQueryDto } from './leave.dto';

/** Which statuses a given approval level is responsible for. */
const LEVEL_FOR_STATUS: Record<string, ApprovalLevel> = {
  PENDING_LINE_MANAGER: ApprovalLevel.LINE_MANAGER,
  PENDING_HR: ApprovalLevel.LOCAL_HR,
  PENDING_GROUP_HR: ApprovalLevel.GROUP_HR,
};

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly workingDays: WorkingDaysService,
    private readonly notifications: NotificationsService
  ) {}

  /**
   * Submit a request (PRD §6.5).
   *
   * Working days are recomputed server-side, the balance is checked against
   * available days, and the whole thing is one transaction — otherwise two
   * concurrent submissions could each pass the balance check and both succeed.
   */
  async apply(dto: ApplyLeaveDto, context: TenantContext = requireTenant()) {
    const employeeId = dto.employeeId ?? context.employeeId;
    if (!employeeId) {
      throw new BadRequestException('No employee record is linked to your account.');
    }

    // Applying on someone else's behalf is an HR action.
    if (employeeId !== context.employeeId && context.role !== 'LOCAL_HR_MANAGER') {
      throw new ForbiddenException('You can only apply for your own leave.');
    }

    const startDate = toCalendarDate(dto.startDate);
    const endDate = toCalendarDate(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('The end date cannot be before the start date.');
    }

    const overlap = await this.workingDays.findOverlapping(employeeId, startDate, endDate, null, context);
    if (overlap) {
      throw new BadRequestException(
        `This overlaps leave you already have booked from ${formatDate(overlap.startDate)} to ${formatDate(overlap.endDate)}.`
      );
    }

    const { workingDays, holidays } = await this.workingDays.countWorkingDays(startDate, endDate, context);
    if (workingDays <= 0) {
      throw new BadRequestException(
        'That range contains no working days — it falls entirely on weekends or public holidays.'
      );
    }

    const request = await this.prisma.withTenant(async tx => {
      const employee = await tx.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, managerId: true, firstName: true, lastName: true },
      });
      if (!employee) throw new NotFoundException('Employee not found');

      const leaveType = await tx.leaveType.findUnique({ where: { id: dto.leaveTypeId } });
      if (!leaveType || !leaveType.isActive) {
        throw new BadRequestException('That leave type is not available.');
      }

      const year = startDate.getFullYear();
      const balance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: { employeeId, leaveTypeId: leaveType.id, year },
        },
      });
      if (!balance) {
        throw new BadRequestException(`No ${leaveType.name} balance exists for ${year}.`);
      }

      const available = this.workingDays.availableDays(balance);
      if (workingDays > available) {
        throw new BadRequestException(
          `You have ${available} day${available === 1 ? '' : 's'} of ${leaveType.name} available, but requested ${workingDays}.`
        );
      }

      // Where does this start in the chain? A Line Manager or HR Manager cannot
      // approve their own request, so theirs begins one level up (PRD §7.3).
      const initialStatus = this.initialStatus(context, leaveType.groupHrThresholdDays, workingDays);

      const created = await tx.leaveRequest.create({
        data: {
          companyId: context.companyId,
          employeeId,
          leaveTypeId: leaveType.id,
          startDate,
          endDate,
          workingDays: new Prisma.Decimal(workingDays),
          reason: dto.reason,
          contactInfo: dto.contactInfo ?? null,
          handoverToId: dto.handoverToId ?? null,
          status: initialStatus,
          approvals: {
            create: this.buildApprovalChain(initialStatus, employee.managerId),
          },
        },
        include: { leaveType: true, approvals: true },
      });

      // Reserve the days immediately. Releasing them on rejection is cheap;
      // discovering an overdrawn balance after the fact is not.
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { pendingDays: { increment: new Prisma.Decimal(workingDays) } },
      });

      return created;
    }, context);

    await this.notifications.notifyLeaveSubmitted(request.id, context);
    await this.audit.record(
      {
        action: 'LEAVE_REQUESTED',
        entityType: 'LeaveRequest',
        entityId: request.id,
        changes: { workingDays, startDate, endDate },
      },
      context
    );

    return { ...this.toDetail(request), holidaysExcluded: holidays };
  }

  /**
   * Approve or reject at the caller's level (PRD §6.5).
   *
   * Approving advances to the next level, or completes the request. Rejecting
   * ends it there and releases the reserved days.
   */
  async decide(id: string, dto: DecideLeaveDto, context: TenantContext = requireTenant()) {
    const result = await this.prisma.withTenant(async tx => {
      const request = await tx.leaveRequest.findUnique({
        where: { id },
        include: { employee: { select: { id: true, managerId: true } }, leaveType: true, approvals: true },
      });
      if (!request) throw new NotFoundException('Leave request not found');

      // The rule that must never be forgotten (PRD §7.3).
      this.scope.assertNotSelfApproval(request.employeeId, context);

      const level = LEVEL_FOR_STATUS[request.status];
      if (!level) {
        throw new BadRequestException(
          `This request is already ${request.status.toLowerCase().replace(/_/g, ' ')}.`
        );
      }
      this.assertCanDecideAt(level, request.employee.managerId, context);

      const decidedAt = new Date();

      await tx.leaveApproval.updateMany({
        where: { leaveRequestId: id, level },
        data: {
          decision: dto.approve ? 'APPROVED' : 'REJECTED',
          approverId: context.employeeId,
          note: dto.note ?? null,
          decidedAt,
        },
      });

      const year = request.startDate.getFullYear();
      const balanceKey = {
        employeeId_leaveTypeId_year: {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year,
        },
      };

      if (!dto.approve) {
        await tx.leaveBalance.update({
          where: balanceKey,
          data: { pendingDays: { decrement: request.workingDays } },
        });

        return tx.leaveRequest.update({
          where: { id },
          data: { status: LeaveStatus.REJECTED, decidedAt },
          include: { leaveType: true, approvals: true },
        });
      }

      const nextStatus = this.nextStatus(request.status, request.leaveType.groupHrThresholdDays, Number(request.workingDays));

      if (nextStatus === LeaveStatus.APPROVED) {
        // Final approval: the reservation becomes actual usage.
        await tx.leaveBalance.update({
          where: balanceKey,
          data: {
            pendingDays: { decrement: request.workingDays },
            usedDays: { increment: request.workingDays },
          },
        });
      } else {
        // Open the next level's approval row so it appears in that queue.
        await tx.leaveApproval.upsert({
          where: { leaveRequestId_level: { leaveRequestId: id, level: LEVEL_FOR_STATUS[nextStatus] } },
          create: { leaveRequestId: id, level: LEVEL_FOR_STATUS[nextStatus] },
          update: {},
        });
      }

      return tx.leaveRequest.update({
        where: { id },
        data: {
          status: nextStatus,
          decidedAt: nextStatus === LeaveStatus.APPROVED ? decidedAt : null,
        },
        include: { leaveType: true, approvals: true },
      });
    }, context);

    await this.notifications.notifyLeaveDecision(result.id, dto.approve, context);
    await this.audit.record(
      {
        action: dto.approve ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
        entityType: 'LeaveRequest',
        entityId: id,
        reason: dto.note ?? null,
      },
      context
    );

    return this.toDetail(result);
  }

  async list(query: ListLeaveQueryDto, context: TenantContext = requireTenant()) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.LeaveRequestWhereInput = {
      AND: [
        // Reuse the same role scoping the employee list uses, so a Line Manager
        // sees their team's requests and an Employee sees only their own.
        { employee: this.scope.employeeScope(context) },
        query.status ? { status: query.status } : {},
        query.employeeId ? { employeeId: query.employeeId } : {},
        query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {},
        query.from ? { endDate: { gte: toCalendarDate(query.from) } } : {},
        query.to ? { startDate: { lte: toCalendarDate(query.to) } } : {},
      ],
    };

    return this.prisma.withTenant(async tx => {
      const [total, rows] = await Promise.all([
        tx.leaveRequest.count({ where }),
        tx.leaveRequest.findMany({
          where,
          orderBy: { submittedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            leaveType: { select: { id: true, name: true, code: true } },
            employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true, photoUrl: true } },
            approvals: { include: { approver: { select: { id: true, firstName: true, lastName: true, jobTitle: true } } } },
          },
        }),
      ]);

      return {
        items: rows.map(row => this.toDetail(row)),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      };
    }, context);
  }

  async findOne(id: string, context: TenantContext = requireTenant()) {
    const request = await this.prisma.withTenant(
      tx =>
        tx.leaveRequest.findUnique({
          where: { id },
          include: {
            leaveType: true,
            employee: { select: { id: true, companyId: true, departmentId: true, managerId: true, firstName: true, lastName: true, jobTitle: true, photoUrl: true } },
            approvals: { include: { approver: { select: { id: true, firstName: true, lastName: true, jobTitle: true } } } },
          },
        }),
      context
    );
    if (!request) throw new NotFoundException('Leave request not found');

    this.scope.assertCanViewEmployee(request.employee, context);
    return this.toDetail(request);
  }

  /** Balances for the current year, for the leave page's summary cards. */
  async balances(employeeId: string | null, context: TenantContext = requireTenant()) {
    const target = employeeId ?? context.employeeId;
    if (!target) throw new BadRequestException('No employee record is linked to your account.');

    if (target !== context.employeeId && context.role === 'EMPLOYEE') {
      throw new ForbiddenException('You can only view your own leave balance.');
    }

    const year = new Date().getFullYear();

    return this.prisma.withTenant(async tx => {
      const balances = await tx.leaveBalance.findMany({
        where: { employeeId: target, year },
        include: { leaveType: { select: { id: true, name: true, code: true, isPaid: true } } },
      });

      return balances.map(balance => ({
        leaveType: balance.leaveType,
        year: balance.year,
        entitledDays: Number(balance.entitledDays),
        carriedOverDays: Number(balance.carriedOverDays),
        adjustmentDays: Number(balance.adjustmentDays),
        usedDays: Number(balance.usedDays),
        pendingDays: Number(balance.pendingDays),
        availableDays: this.workingDays.availableDays(balance),
      }));
    }, context);
  }

  /** Manual HR adjustment — reason mandatory and audited (PRD §6.5). */
  async adjustBalance(dto: AdjustBalanceDto, context: TenantContext = requireTenant()) {
    const year = dto.year ?? new Date().getFullYear();

    const updated = await this.prisma.withTenant(
      tx =>
        tx.leaveBalance.update({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: dto.employeeId,
              leaveTypeId: dto.leaveTypeId,
              year,
            },
          },
          data: {
            adjustmentDays: { increment: new Prisma.Decimal(dto.days) },
            adjustmentReason: dto.reason,
          },
        }),
      context
    );

    await this.audit.record(
      {
        action: 'LEAVE_BALANCE_ADJUSTED',
        entityType: 'LeaveBalance',
        entityId: updated.id,
        reason: dto.reason,
        changes: { days: dto.days, year },
      },
      context
    );

    return { id: updated.id, adjustmentDays: Number(updated.adjustmentDays) };
  }

  /** Team calendar feed — who is away, and when. */
  async calendar(from: string, to: string, context: TenantContext = requireTenant()) {
    return this.prisma.withTenant(
      tx =>
        tx.leaveRequest.findMany({
          where: {
            employee: this.scope.employeeScope(context),
            status: { in: [LeaveStatus.APPROVED, LeaveStatus.PENDING_LINE_MANAGER, LeaveStatus.PENDING_HR] },
            startDate: { lte: toCalendarDate(to) },
            endDate: { gte: toCalendarDate(from) },
          },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
            leaveType: { select: { name: true, code: true } },
            employee: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
          },
          orderBy: { startDate: 'asc' },
        }),
      context
    );
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Where a new request enters the chain.
   *
   * An Employee starts at their Line Manager. A Line Manager's own request skips
   * to HR, and an HR Manager's skips to Group HR — because nobody approves their
   * own request, and the level below cannot review the level above (PRD §7.3).
   */
  private initialStatus(
    context: TenantContext,
    groupHrThresholdDays: number | null,
    workingDays: number
  ): LeaveStatus {
    if (groupHrThresholdDays !== null && workingDays > groupHrThresholdDays) {
      return LeaveStatus.PENDING_GROUP_HR;
    }
    switch (context.role) {
      case 'LOCAL_HR_MANAGER':
      case 'GROUP_HR_MANAGER':
        return LeaveStatus.PENDING_GROUP_HR;
      case 'LINE_MANAGER':
        return LeaveStatus.PENDING_HR;
      default:
        return LeaveStatus.PENDING_LINE_MANAGER;
    }
  }

  private nextStatus(
    current: LeaveStatus,
    groupHrThresholdDays: number | null,
    workingDays: number
  ): LeaveStatus {
    const needsGroupHr = groupHrThresholdDays !== null && workingDays > groupHrThresholdDays;

    switch (current) {
      case LeaveStatus.PENDING_LINE_MANAGER:
        return LeaveStatus.PENDING_HR;
      case LeaveStatus.PENDING_HR:
        return needsGroupHr ? LeaveStatus.PENDING_GROUP_HR : LeaveStatus.APPROVED;
      case LeaveStatus.PENDING_GROUP_HR:
      default:
        return LeaveStatus.APPROVED;
    }
  }

  private buildApprovalChain(initialStatus: LeaveStatus, managerId: string | null) {
    const level = LEVEL_FOR_STATUS[initialStatus];
    return [
      {
        level,
        // Pre-assign the line manager so the request lands in a named queue
        // rather than a pool nobody owns.
        approverId: level === ApprovalLevel.LINE_MANAGER ? managerId : null,
      },
    ];
  }

  private assertCanDecideAt(
    level: ApprovalLevel,
    employeeManagerId: string | null,
    context: TenantContext
  ): void {
    switch (level) {
      case ApprovalLevel.LINE_MANAGER:
        // The named manager, or HR stepping in for an absent one.
        if (
          context.employeeId === employeeManagerId ||
          context.role === 'LOCAL_HR_MANAGER' ||
          context.role === 'GROUP_HR_MANAGER'
        ) {
          return;
        }
        throw new ForbiddenException('Only this employee’s line manager can review at this stage.');

      case ApprovalLevel.LOCAL_HR:
        if (context.role === 'LOCAL_HR_MANAGER' || context.role === 'GROUP_HR_MANAGER') return;
        throw new ForbiddenException('Only an HR Manager can review at this stage.');

      case ApprovalLevel.GROUP_HR:
        if (context.role === 'GROUP_HR_MANAGER') return;
        throw new ForbiddenException('Only a Group HR Manager can review at this stage.');
    }
  }

  private toDetail(request: any) {
    return {
      id: request.id,
      status: request.status,
      startDate: request.startDate,
      endDate: request.endDate,
      workingDays: Number(request.workingDays),
      reason: request.reason,
      contactInfo: request.contactInfo,
      submittedAt: request.submittedAt,
      decidedAt: request.decidedAt,
      escalatedAt: request.escalatedAt,
      leaveType: request.leaveType
        ? { id: request.leaveType.id, name: request.leaveType.name, code: request.leaveType.code }
        : null,
      employee: request.employee ?? null,
      approvals: (request.approvals ?? []).map((approval: any) => ({
        level: approval.level,
        decision: approval.decision,
        note: approval.note,
        decidedAt: approval.decidedAt,
        approver: approval.approver ?? null,
      })),
    };
  }
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
