import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  /** The short code staff type at sign-in, e.g. "001122". */
  @IsString()
  @IsNotEmpty({ message: 'Company code is required' })
  @Transform(({ value }) => String(value ?? '').trim())
  companyCode!: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => String(value ?? '').trim())
  companyCode!: string;

  @IsEmail()
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  /**
   * 12 characters minimum. The PRD does not set a policy, so this follows
   * current NIST guidance: length over composition rules, which push people
   * toward predictable substitutions.
   */
  @IsString()
  @MinLength(12, { message: 'Use at least 12 characters' })
  password!: string;
}
