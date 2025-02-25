import { AttendanceStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class ListAttendanceQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsEnum(AttendanceStatus) status?: AttendanceStatus;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  /** Defaults to 31 — a month of rows is the natural page for a history view. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 31;
}

export class RequestCorrectionDto {
  @IsUUID() attendanceRecordId!: string;

  @IsOptional() @IsDateString() requestedClockIn?: string;
  @IsOptional() @IsDateString() requestedClockOut?: string;
  @IsOptional() @IsEnum(AttendanceStatus) requestedStatus?: AttendanceStatus;

  @IsString()
  @MinLength(10, { message: 'Explain the correction in at least 10 characters' })
  reason!: string;
}

export class DecideCorrectionDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @IsString() note?: string;
}

/** HR setting a record directly (PRD §6.4). Reason is mandatory — it is audited. */
export class ManualAttendanceDto {
  @IsUUID() employeeId!: string;
  @IsDateString() workDate!: string;
  @IsEnum(AttendanceStatus) status!: AttendanceStatus;

  @IsOptional() @IsDateString() clockInAt?: string;
  @IsOptional() @IsDateString() clockOutAt?: string;

  @IsString()
  @MinLength(10, { message: 'Give a justification of at least 10 characters — it is recorded in the audit log' })
  reason!: string;
}
