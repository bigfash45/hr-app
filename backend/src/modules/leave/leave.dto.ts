import { LeaveStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class ApplyLeaveDto {
  @IsUUID() leaveTypeId!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;

  @IsString()
  @MinLength(3, { message: 'Give a short reason for the request' })
  @Transform(({ value }) => String(value ?? '').trim())
  reason!: string;

  /** Where to reach them while away. */
  @IsOptional() @IsString() contactInfo?: string;
  /** Who covers the work. */
  @IsOptional() @IsUUID() handoverToId?: string;

  /** HR applying on someone's behalf. Ignored for everyone else. */
  @IsOptional() @IsUUID() employeeId?: string;
}

export class DecideLeaveDto {
  @IsBoolean() approve!: boolean;

  /** Optional when approving; a rejection without a reason helps nobody. */
  @IsOptional() @IsString() note?: string;
}

export class AdjustBalanceDto {
  @IsUUID() employeeId!: string;
  @IsUUID() leaveTypeId!: string;

  /** Positive to credit, negative to debit. */
  @IsNumber() @Min(-365) @Max(365) days!: number;

  @IsString()
  @MinLength(10, { message: 'Give a reason of at least 10 characters — it is recorded in the audit log' })
  reason!: string;

  @IsOptional() @Type(() => Number) @IsInt() year?: number;
}

export class ListLeaveQueryDto {
  @IsOptional() @IsEnum(LeaveStatus) status?: LeaveStatus;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() leaveTypeId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 25;
}

export class CalendarQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}
