import { PartialType } from '@nestjs/swagger';
import { EmployeeStatus, EmploymentType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateEmployeeDto {
  // ── Required (PRD §6.3) ──
  @IsString() @IsNotEmpty() @trim() firstName!: string;
  @IsString() @IsNotEmpty() @trim() lastName!: string;
  @IsEmail() @Transform(({ value }) => String(value ?? '').trim().toLowerCase()) email!: string;
  @IsString() @IsNotEmpty() @trim() jobTitle!: string;
  @IsDateString() startDate!: string;
  @IsEnum(EmploymentType) employmentType!: EmploymentType;

  @IsOptional() @IsUUID() departmentId?: string;
  /** Reporting manager. Single line for Phase 0 (PRD §17 Q13). */
  @IsOptional() @IsUUID() managerId?: string;

  /**
   * Optional — generated from the company prefix when omitted, so HR does not
   * have to track the next free number by hand.
   */
  @IsOptional() @IsString() @trim() employeeNumber?: string;

  // ── Personal, Tier 2 ──
  @IsOptional() @IsString() @trim() middleName?: string;
  @IsOptional() @IsString() @trim() phone?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() maritalStatus?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() addressLine?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;

  // ── Employment ──
  @IsOptional() @IsString() workLocation?: string;
  @IsOptional() @IsDateString() probationEndDate?: string;
  @IsOptional() @IsDateString() contractEndDate?: string;

  // ── Tier 1, highly sensitive — Local HR only (PRD §7.2) ──
  @IsOptional() @IsString() salaryAmount?: string;
  @IsOptional() @IsString() payFrequency?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankAccountNumber?: string;
  @IsOptional() @IsString() pfaName?: string;
  @IsOptional() @IsString() rsaPin?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() nin?: string;
  @IsOptional() @IsString() bvn?: string;

  /** Create a login for this person and email them a set-password link. */
  @IsOptional() @IsBoolean() createUserAccount?: boolean;
}

/**
 * Every field optional — a PATCH should be able to change one thing.
 *
 * PartialType rather than `extends CreateEmployeeDto` with `declare`: TypeScript
 * erases `declare` fields, taking their validation decorators with them, so the
 * overrides would silently do nothing.
 */
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {
  /** Local HR only (PRD §7.2). */
  @IsOptional() @IsString() hrNotes?: string;
}

/** Deactivation requires a reason, which is written to the audit log (PRD §6.3). */
export class DeactivateEmployeeDto {
  @IsString()
  @MinLength(10, { message: 'Give a reason of at least 10 characters — it is recorded in the audit log' })
  @trim()
  reason!: string;
}

export class ListEmployeesQueryDto {
  @IsOptional() @IsString() @trim() search?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @IsOptional() @IsUUID() managerId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 25;
}
