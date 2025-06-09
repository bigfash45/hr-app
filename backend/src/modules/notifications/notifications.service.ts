import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LeaveStatus } from '@prisma/client';
import { subHours } from 'date-fns';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { TenantContext, requireTenant } from '../../core/tenant/tenant-context';
import { MailService } from './mail.service';

/**
 * In-app and email notifications (PRD §8), plus the leave reminder sweeps.
 *
 * In-app alerts for critical actions cannot be disabled (PRD §8); email
 * preferences are a Phase 1 concern and are not read yet.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService
  ) {}

  async listForCurrentUser(context: TenantContext = requireTenant()) {
    if (!context.employeeId) return { items: [], unreadCount: 0 };

    return this.prisma.withTenant(async tx => {
      const [items, unreadCount] = await Promise.all([
        tx.notification.findMany({
          where: { recipientId: context.employeeId! },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        tx.notification.count({ where: { recipientId: context.employeeId!, readAt: null } }),
      ]);
      return { items, unreadCount };
    }, context);
  }

  async markRead(id: string, context: TenantContext = requireTenant()) {
    await this.prisma.withTenant(
      tx =>
        tx.notification.updateMany({
          where: { id, recipientId: context.employeeId ?? '__none__', readAt: null },
          data: { readAt: new Date() },
        }),
      context
    );
    return { id, read: true };
  }

  async notifyLeaveSubmitted(requestId: string, context: TenantContext): Promise<void> {
    await this.prisma.withTenant(async tx => {
      const request = await tx.leaveRequest.findUnique({
        where: { id: requestId },
        include: {
          employee: { select: { firstName: true, lastName: true, managerId: true } },
          leaveType: { select: { name: true } },
        },
      });
      if (!request) return;

      const recipients = await this.approverEmployeeIds(tx, request.status, request.employee.managerId, context);
      if (!recipients.length) return;

      await tx.notification.createMany({
        data: recipients.map(recipientId => ({
          companyId: context.companyId,
          recipientId,
          eventType: 'LEAVE_SUBMITTED',
          title: 'Leave request awaiting your review',
          body: `${request.employee.firstName} ${request.employee.lastName} requested ${Number(request.workingDays)} day(s) of ${request.leaveType.name}.`,
          actionUrl: `/leave/detail/${request.id}`,
        })),
      });
    }, context);
  }

  async notifyLeaveDecision(requestId: string, approved: boolean, context: TenantContext): Promise<void> {
    await this.prisma.withTenant(async tx => {
      const request = await tx.leaveRequest.findUnique({
        where: { id: requestId },
        include: { leaveType: { select: { name: true } } },
      });
      if (!request) return;

      // Intermediate approvals are not the employee's business — they only hear
      // about the outcome, or a rejection.
      const isFinal = request.status === LeaveStatus.APPROVED || request.status === LeaveStatus.REJECTED;
      if (!isFinal) return;

      await tx.notification.create({
        data: {
          companyId: context.companyId,
          recipientId: request.employeeId,
          eventType: approved ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
          title: approved ? 'Your leave was approved' : 'Your leave request was declined',
          body: `${request.leaveType.name}, ${Number(request.workingDays)} day(s).`,
          actionUrl: `/leave/detail/${request.id}`,
        },
      });
    }, context);
  }

  /**
   * 48h reminder, 72h auto-escalation (PRD §6.5).
   *
   * Runs hourly rather than continuously — the thresholds are in days, so
   * minute-level precision buys nothing and costs a query every minute.
   *
   * Deliberately runs unscoped across all companies: this is a system sweep, not
   * a user request, so there is no tenant context to inherit.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepStaleLeaveRequests(): Promise<void> {
    const now = new Date();

    try {
      await this.prisma.withoutTenantScope(async client => {
        // ── 48h: remind, once ──
        const needingReminder = await client.leaveRequest.findMany({
          where: {
            status: { in: [LeaveStatus.PENDING_LINE_MANAGER, LeaveStatus.PENDING_HR] },
            submittedAt: { lte: subHours(now, 48) },
            OR: [{ lastReminderAt: null }, { lastReminderAt: { lte: subHours(now, 24) } }],
          },
          include: { employee: { select: { managerId: true, firstName: true, lastName: true } } },
          take: 200,
        });

        for (const request of needingReminder) {
          if (request.employee.managerId) {
            await client.notification.create({
              data: {
                companyId: request.companyId,
                recipientId: request.employee.managerId,
                eventType: 'LEAVE_PENDING_REMINDER',
                title: 'Leave request still awaiting your review',
                body: `${request.employee.firstName} ${request.employee.lastName}'s request has been pending for more than 48 hours.`,
                actionUrl: `/leave/detail/${request.id}`,
              },
            });
          }
          await client.leaveRequest.update({
            where: { id: request.id },
            data: { lastReminderAt: now },
          });
        }

        // ── 72h: escalate past the line manager to HR ──
        const needingEscalation = await client.leaveRequest.findMany({
          where: {
            status: LeaveStatus.PENDING_LINE_MANAGER,
            submittedAt: { lte: subHours(now, 72) },
            escalatedAt: null,
          },
          take: 200,
        });

        for (const request of needingEscalation) {
          await client.$transaction([
            client.leaveRequest.update({
              where: { id: request.id },
              data: { status: LeaveStatus.PENDING_HR, escalatedAt: now },
            }),
            client.leaveApproval.upsert({
              where: { leaveRequestId_level: { leaveRequestId: request.id, level: 'LOCAL_HR' } },
              create: { leaveRequestId: request.id, level: 'LOCAL_HR' },
              update: {},
            }),
            client.auditLog.create({
              data: {
                companyId: request.companyId,
                action: 'LEAVE_AUTO_ESCALATED',
                entityType: 'LeaveRequest',
                entityId: request.id,
                reason: 'No line manager decision within 72 hours',
              },
            }),
          ]);
        }

        if (needingReminder.length || needingEscalation.length) {
          this.logger.log(
            `Leave sweep: ${needingReminder.length} reminded, ${needingEscalation.length} escalated`
          );
        }
      });
    } catch (cause) {
      // A failed sweep must not take the process down — it retries next hour.
      this.logger.error('Leave reminder sweep failed', cause instanceof Error ? cause.stack : String(cause));
    }
  }

  private async approverEmployeeIds(
    tx: any,
    status: LeaveStatus,
    managerId: string | null,
    context: TenantContext
  ): Promise<string[]> {
    if (status === LeaveStatus.PENDING_LINE_MANAGER && managerId) return [managerId];

    const role = status === LeaveStatus.PENDING_GROUP_HR ? 'GROUP_HR_MANAGER' : 'LOCAL_HR_MANAGER';
    const users = await tx.user.findMany({
      where: { role, isActive: true, companyId: context.companyId },
      select: { employee: { select: { id: true } } },
    });

    return users
      .map((user: { employee: { id: string } | null }) => user.employee?.id)
      .filter((id: string | undefined): id is string => Boolean(id));
  }
}
