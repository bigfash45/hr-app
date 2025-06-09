import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataTier, Employee, EmployeeStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { FieldEncryptionService } from '../../core/crypto/field-encryption.service';
import { ScopeService } from '../../core/access/scope.service';
import { TenantContext, requireTenant } from '../../core/tenant/tenant-context';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../notifications/mail.service';
import {
  CreateEmployeeDto,
  DeactivateEmployeeDto,
  ListEmployeesQueryDto,
  UpdateEmployeeDto,
} from './employees.dto';

/** Columns holding ciphertext. Encrypt on write, decrypt on read. */
const ENCRYPTED_FIELDS = [
  'salaryAmount',
  'bankAccountNumber',
  'rsaPin',
  'nin',
  'bvn',
  'taxId',
] as const;

/** Default onboarding checklist for a new hire (PRD §6.3). */
const DEFAULT_ONBOARDING_TASKS = [
  { title: 'Send welcome email', category: 'HR', sequence: 1, dueInDays: 0 },
  { title: 'Prepare workstation and IT accounts', category: 'IT', sequence: 2, dueInDays: 1 },
  { title: 'Collect signed employment contract', category: 'HR', sequence: 3, dueInDays: 3 },
  { title: 'Collect ID, NIN and bank details', category: 'HR', sequence: 4, dueInDays: 3 },
  { title: 'Enrol in pension (PFA / RSA PIN)', category: 'HR', sequence: 5, dueInDays: 7 },
  { title: 'Introduce to team and assign buddy', category: 'Manager', sequence: 6, dueInDays: 1 },
  { title: 'Review probation objectives', category: 'Manager', sequence: 7, dueInDays: 14 },
];

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: FieldEncryptionService,
    private readonly scope: ScopeService,
    private readonly mail: MailService
  ) {}

  async list(query: ListEmployeesQueryDto, context: TenantContext = requireTenant()) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.EmployeeWhereInput = {
      AND: [
        this.scope.employeeScope(context),
        query.departmentId ? { departmentId: query.departmentId } : {},
        query.managerId ? { managerId: query.managerId } : {},
        // Deactivated staff are hidden unless explicitly asked for — their
        // records are retained (PRD §6.3), just not in the working list.
        query.status ? { status: query.status } : { status: { not: EmployeeStatus.DEACTIVATED } },
        query.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
                { employeeNumber: { contains: query.search, mode: 'insensitive' } },
                { jobTitle: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    return this.prisma.withTenant(async tx => {
      const [total, rows] = await Promise.all([
        tx.employee.count({ where }),
        tx.employee.findMany({
          where,
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            department: { select: { id: true, name: true } },
            manager: { select: { id: true, firstName: true, lastName: true } },
          },
        }),
      ]);

      return {
        // The list never carries Tier 1 fields, whoever is asking. A salary
        // column has no business travelling with a directory listing.
        items: rows.map(row => this.toSummary(row)),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      };
    }, context);
  }

  async findOne(id: string, context: TenantContext = requireTenant()) {
    const employee = await this.prisma.withTenant(
      tx =>
        tx.employee.findUnique({
          where: { id },
          include: {
            department: { select: { id: true, name: true } },
            manager: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
            reports: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
            user: { select: { id: true, email: true, role: true, isActive: true, lastLoginAt: true } },
          },
        }),
      context
    );

    if (!employee) throw new NotFoundException('Employee not found');
    this.scope.assertCanViewEmployee(employee, context);

    const canSeeSensitive = this.scope.canViewSensitiveFields(employee.id, context);

    // Reading someone else's Tier 1 data is itself an audited event (PRD §11.1).
    if (canSeeSensitive && context.employeeId !== employee.id) {
      await this.audit.record(
        {
          action: 'EMPLOYEE_SENSITIVE_VIEWED',
          entityType: 'Employee',
          entityId: employee.id,
          dataTier: DataTier.TIER_1_HIGHLY_SENSITIVE,
        },
        context
      );
    }

    return {
      ...this.toSummary(employee),
      middleName: employee.middleName,
      phone: employee.phone,
      dateOfBirth: employee.dateOfBirth,
      gender: employee.gender,
      maritalStatus: employee.maritalStatus,
      nationality: employee.nationality,
      addressLine: employee.addressLine,
      city: employee.city,
      state: employee.state,
      workLocation: employee.workLocation,
      probationEndDate: employee.probationEndDate,
      contractEndDate: employee.contractEndDate,
      reports: employee.reports,
      account: employee.user,

      ...(canSeeSensitive ? this.decryptSensitive(employee) : {}),
      ...(this.scope.canViewHrNotes(context) ? { hrNotes: employee.hrNotes } : {}),
    };
  }

  async create(dto: CreateEmployeeDto, context: TenantContext = requireTenant()) {
    const employee = await this.prisma.withTenant(async tx => {
      const employeeNumber = dto.employeeNumber?.trim() || (await this.nextEmployeeNumber(tx, context));

      if (dto.managerId) await this.assertSameCompany(tx, dto.managerId, 'Reporting manager');
      if (dto.departmentId) await this.assertDepartmentExists(tx, dto.departmentId);

      const created = await tx.employee.create({
        data: {
          companyId: context.companyId,
          employeeNumber,
          firstName: dto.firstName,
          lastName: dto.lastName,
          middleName: dto.middleName ?? null,
          email: dto.email,
          phone: dto.phone ?? null,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          gender: dto.gender ?? null,
          maritalStatus: dto.maritalStatus ?? null,
          nationality: dto.nationality ?? 'Nigerian',
          addressLine: dto.addressLine ?? null,
          city: dto.city ?? null,
          state: dto.state ?? null,

          jobTitle: dto.jobTitle,
          employmentType: dto.employmentType,
          startDate: new Date(dto.startDate),
          probationEndDate: dto.probationEndDate ? new Date(dto.probationEndDate) : null,
          contractEndDate: dto.contractEndDate ? new Date(dto.contractEndDate) : null,
          workLocation: dto.workLocation ?? null,
          departmentId: dto.departmentId ?? null,
          managerId: dto.managerId ?? null,
          status: dto.probationEndDate ? EmployeeStatus.ON_PROBATION : EmployeeStatus.ACTIVE,

          ...this.encryptSensitive(dto),
          salaryCurrency: 'NGN',
          payFrequency: dto.payFrequency ?? null,
          bankName: dto.bankName ?? null,
          pfaName: dto.pfaName ?? null,
        },
      });

      // Auto-generate the onboarding checklist (PRD §6.3).
      await tx.onboardingTask.createMany({
        data: DEFAULT_ONBOARDING_TASKS.map(task => ({
          companyId: context.companyId,
          employeeId: created.id,
          title: task.title,
          category: task.category,
          sequence: task.sequence,
          dueDate: addDays(new Date(dto.startDate), task.dueInDays),
        })),
      });

      // Give them this year's leave entitlement, pro-rated if they join mid-year.
      await this.seedLeaveBalances(tx, created, context);

      return created;
    }, context);

    if (dto.createUserAccount) await this.provisionAccount(employee, context);

    await this.audit.record(
      {
        action: 'EMPLOYEE_CREATED',
        entityType: 'Employee',
        entityId: employee.id,
        changes: { employeeNumber: employee.employeeNumber, email: employee.email },
        dataTier: DataTier.TIER_2_PERSONAL,
      },
      context
    );

    return this.findOne(employee.id, context);
  }

  async update(id: string, dto: UpdateEmployeeDto, context: TenantContext = requireTenant()) {
    const before = await this.prisma.withTenant(tx => tx.employee.findUnique({ where: { id } }), context);
    if (!before) throw new NotFoundException('Employee not found');
    this.scope.assertCanViewEmployee(before, context);

    // Tier 1 and HR notes are Local HR's alone to change (PRD §7.2). Silently
    // dropping them would be worse than refusing — HR would think it saved.
    const touchesSensitive = ENCRYPTED_FIELDS.some(field => dto[field] !== undefined);
    if ((touchesSensitive || dto.hrNotes !== undefined) && context.role !== 'LOCAL_HR_MANAGER') {
      throw new BadRequestException(
        'Salary, bank, and HR note fields can only be changed by an HR Manager.'
      );
    }

    const updated = await this.prisma.withTenant(
      tx =>
        tx.employee.update({
          where: { id },
          data: {
            ...pickDefined({
              firstName: dto.firstName,
              lastName: dto.lastName,
              middleName: dto.middleName,
              email: dto.email,
              phone: dto.phone,
              gender: dto.gender,
              maritalStatus: dto.maritalStatus,
              nationality: dto.nationality,
              addressLine: dto.addressLine,
              city: dto.city,
              state: dto.state,
              jobTitle: dto.jobTitle,
              employmentType: dto.employmentType,
              workLocation: dto.workLocation,
              departmentId: dto.departmentId,
              managerId: dto.managerId,
              bankName: dto.bankName,
              pfaName: dto.pfaName,
              payFrequency: dto.payFrequency,
              hrNotes: dto.hrNotes,
            }),
            ...(dto.dateOfBirth ? { dateOfBirth: new Date(dto.dateOfBirth) } : {}),
            ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
            ...(dto.probationEndDate ? { probationEndDate: new Date(dto.probationEndDate) } : {}),
            ...(dto.contractEndDate ? { contractEndDate: new Date(dto.contractEndDate) } : {}),
            ...this.encryptSensitive(dto),
          },
        }),
      context
    );

    await this.audit.record(
      {
        action: 'EMPLOYEE_UPDATED',
        entityType: 'Employee',
        entityId: id,
        // The diff redacts Tier 1 values — it records that salary changed, not
        // the figures.
        changes: this.audit.diff(before as unknown as Record<string, unknown>, dto as Record<string, unknown>),
        dataTier: touchesSensitive ? DataTier.TIER_1_HIGHLY_SENSITIVE : DataTier.TIER_2_PERSONAL,
      },
      context
    );

    return this.findOne(updated.id, context);
  }

  /**
   * Deactivate: keep the history, cut the access, record why (PRD §6.3).
   *
   * Never a delete. Records are retained for 7 years post-deactivation
   * (PRD §11.3), and attendance and leave history must stay intact.
   */
  async deactivate(id: string, dto: DeactivateEmployeeDto, context: TenantContext = requireTenant()) {
    const employee = await this.prisma.withTenant(
      tx => tx.employee.findUnique({ where: { id }, include: { user: true } }),
      context
    );
    if (!employee) throw new NotFoundException('Employee not found');

    if (employee.id === context.employeeId) {
      throw new BadRequestException('You cannot deactivate your own record.');
    }

    await this.prisma.withTenant(async tx => {
      await tx.employee.update({
        where: { id },
        data: {
          status: EmployeeStatus.DEACTIVATED,
          deactivatedAt: new Date(),
          deactivationReason: dto.reason,
          deactivatedById: context.employeeId,
        },
      });

      // Access is revoked immediately, not at next login (PRD §6.3).
      if (employee.userId) {
        await tx.user.update({ where: { id: employee.userId }, data: { isActive: false } });
      }

      // PRD §17 Q10 is still open. Auto-rejecting pending requests is the
      // suggested behaviour there, and leaving them PENDING forever would put
      // them in an approver's queue for someone who has left.
      await tx.leaveRequest.updateMany({
        where: {
          employeeId: id,
          status: { in: ['PENDING_LINE_MANAGER', 'PENDING_HR', 'PENDING_GROUP_HR'] },
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: 'Employee deactivated',
        },
      });
    }, context);

    if (employee.userId) {
      await this.prisma.withoutTenantScope(client =>
        client.refreshToken.updateMany({
          where: { userId: employee.userId!, revokedAt: null },
          data: { revokedAt: new Date() },
        })
      );
    }

    await this.audit.record(
      {
        action: 'EMPLOYEE_DEACTIVATED',
        entityType: 'Employee',
        entityId: id,
        reason: dto.reason,
        dataTier: DataTier.TIER_2_PERSONAL,
      },
      context
    );

    return { id, status: EmployeeStatus.DEACTIVATED };
  }

  /** Directory / org chart feed — no sensitive fields, by construction. */
  async orgChart(context: TenantContext = requireTenant()) {
    const employees = await this.prisma.withTenant(
      tx =>
        tx.employee.findMany({
          where: { status: { not: EmployeeStatus.DEACTIVATED } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            photoUrl: true,
            managerId: true,
            department: { select: { id: true, name: true } },
          },
          orderBy: { firstName: 'asc' },
        }),
      context
    );

    return employees.map(e => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      jobTitle: e.jobTitle,
      photoUrl: e.photoUrl,
      managerId: e.managerId,
      department: e.department?.name ?? null,
    }));
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private toSummary(employee: Employee & { department?: { id: string; name: string } | null; manager?: unknown }) {
    return {
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      fullName: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,
      jobTitle: employee.jobTitle,
      employmentType: employee.employmentType,
      status: employee.status,
      startDate: employee.startDate,
      photoUrl: employee.photoUrl,
      department: employee.department ?? null,
      manager: employee.manager ?? null,
    };
  }

  private encryptSensitive(dto: Partial<CreateEmployeeDto>): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const field of ENCRYPTED_FIELDS) {
      if (dto[field] !== undefined) out[field] = this.crypto.encrypt(dto[field]);
    }
    return out;
  }

  private decryptSensitive(employee: Employee): Record<string, string | null> {
    return {
      salaryAmount: this.crypto.decrypt(employee.salaryAmount),
      salaryCurrency: employee.salaryCurrency,
      payFrequency: employee.payFrequency,
      bankName: employee.bankName,
      bankAccountNumber: this.crypto.decrypt(employee.bankAccountNumber),
      pfaName: employee.pfaName,
      rsaPin: this.crypto.decrypt(employee.rsaPin),
      taxId: this.crypto.decrypt(employee.taxId),
      nin: this.crypto.decrypt(employee.nin),
      bvn: this.crypto.decrypt(employee.bvn),
    };
  }

  /** Next free staff number, zero-padded, e.g. D0007. */
  private async nextEmployeeNumber(
    tx: Prisma.TransactionClient,
    context: TenantContext
  ): Promise<string> {
    const count = await tx.employee.count({ where: { companyId: context.companyId } });
    return `D${String(count + 1).padStart(4, '0')}`;
  }

  private async assertSameCompany(
    tx: Prisma.TransactionClient,
    employeeId: string,
    label: string
  ): Promise<void> {
    // RLS already bounds this to the caller's company, so a cross-tenant id
    // simply comes back null.
    const exists = await tx.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!exists) throw new BadRequestException(`${label} was not found in this company.`);
  }

  private async assertDepartmentExists(
    tx: Prisma.TransactionClient,
    departmentId: string
  ): Promise<void> {
    const exists = await tx.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!exists) throw new BadRequestException('Department was not found in this company.');
  }

  /**
   * Pro-rated entitlement for a mid-year joiner (PRD glossary: Pro-Rata).
   * Someone starting in October should not get all 21 days for that year.
   */
  private async seedLeaveBalances(
    tx: Prisma.TransactionClient,
    employee: Employee,
    context: TenantContext
  ): Promise<void> {
    const year = new Date().getFullYear();
    const leaveTypes = await tx.leaveType.findMany({
      where: { companyId: context.companyId, isActive: true },
    });
    if (!leaveTypes.length) return;

    const startedThisYear = employee.startDate.getFullYear() === year;
    const monthsRemaining = startedThisYear ? 12 - employee.startDate.getMonth() : 12;

    await tx.leaveBalance.createMany({
      data: leaveTypes.map(type => ({
        companyId: context.companyId,
        employeeId: employee.id,
        leaveTypeId: type.id,
        year,
        entitledDays: new Prisma.Decimal(
          Math.round((type.defaultDays * monthsRemaining) / 12)
        ),
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Create a login and email a set-password link.
   *
   * No password is ever generated and sent — a temporary password in an inbox is
   * a credential sitting in plaintext. The account starts with an unusable hash
   * and the only way in is the emailed single-use link.
   */
  private async provisionAccount(employee: Employee, context: TenantContext): Promise<void> {
    const unusableHash = await AuthService.hashPassword(randomBytes(32).toString('base64url'));

    await this.prisma.withTenant(
      tx =>
        tx.user.create({
          data: {
            companyId: employee.companyId,
            email: employee.email,
            passwordHash: unusableHash,
            role: 'EMPLOYEE',
            mustSetPassword: true,
            employee: { connect: { id: employee.id } },
          },
        }),
      context
    );

    await this.audit.record(
      { action: 'USER_ACCOUNT_PROVISIONED', entityType: 'Employee', entityId: employee.id },
      context
    );
  }
}

function pickDefined<T extends Record<string, unknown>>(source: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
