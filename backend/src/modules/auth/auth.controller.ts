import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService, LoginResult } from './auth.service';
import { ForgotPasswordDto, LoginDto, ResetPasswordDto } from './auth.dto';
import { CurrentUser, Public } from './auth.decorators';
import { TenantContext } from '../../core/tenant/tenant-context';
import { MailService } from '../notifications/mail.service';

const REFRESH_COOKIE = 'nownowhr_rt';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly mail: MailService
  ) {}

  /**
   * Rate-limited hard: 5 attempts per minute per IP. Account lockout (PRD §6.1)
   * stops one account being ground down; this stops one attacker spraying the
   * same password across every account in the company.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<Omit<LoginResult, 'refreshToken'>> {
    const result = await this.auth.login(dto.companyCode, dto.email, dto.password, {
      ip: req.ip,
      userAgent: req.header('user-agent'),
    });

    this.setRefreshCookie(res, result.refreshToken);

    // The refresh token goes in an httpOnly cookie and never in the body, so
    // no script in the page can read it (PRD §11.2).
    const { refreshToken: _discard, ...body } = result;
    return body;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<Omit<LoginResult, 'refreshToken'>> {
    const presented = req.cookies?.[REFRESH_COOKIE] ?? null;
    const result = await this.auth.refresh(presented, {
      ip: req.ip,
      userAgent: req.header('user-agent'),
    });

    this.setRefreshCookie(res, result.refreshToken);

    const { refreshToken: _discard, ...body } = result;
    return body;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] ?? null);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  /**
   * Always returns 204, whether or not the address exists — otherwise this
   * endpoint becomes a way to discover who works here.
   */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @Post('forgot-password')
  @HttpCode(204)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    const token = await this.auth.requestPasswordReset(dto.companyCode, dto.email);
    if (token) await this.mail.sendPasswordReset(dto.email, token);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  /** Who am I — used by the client on boot to restore identity after a refresh. */
  @Get('me')
  me(@CurrentUser() user: TenantContext | null) {
    return {
      userId: user?.userId,
      email: user?.email,
      role: user?.role,
      companyId: user?.companyId,
      employeeId: user?.employeeId,
      departmentId: user?.departmentId,
      permittedCompanyIds: user?.permittedCompanyIds ?? [],
    };
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: this.config.get<number>('SESSION_ABSOLUTE_HOURS', 8) * 3600 * 1000,
    });
  }

  private cookieOptions() {
    const isProduction = this.config.get('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      // Secure requires HTTPS, which the dev server over plain http does not
      // have. Production must be HTTPS regardless (PRD §11.2).
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
    };
  }
}
