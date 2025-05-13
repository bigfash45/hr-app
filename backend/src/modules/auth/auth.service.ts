import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { addHours, addMinutes, isBefore } from 'date-fns';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../../core/audit/audit.service';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: Role;
  companyId: string;
  employeeId: string | null;
  departmentId: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: Role;
    companyId: string;
    companyName: string;
    employeeId: string | null;
    mustSetPassword: boolean;
  };
}

/** Deliberately identical for every failure mode — see the note in `login`. */
const GENERIC_LOGIN_FAILURE = 'The details you entered are incorrect.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService
  ) {}

  /**
   * Company code + email + password (PRD §6.1).
   *
   * Every failure path returns the same message and the same timing shape. If a
   * wrong email failed faster than a wrong password, the endpoint would become a
   * way to enumerate who works here — which for an HR system is itself a
   * personal-data leak under NDPR.
   */
  async login(
    companyCode: string,
    email: string,
    password: string,
    meta: { ip?: string; userAgent?: string } = {}
  ): Promise<LoginResult> {
    const normalisedEmail = email.trim().toLowerCase();

    const user = await this.prisma.withoutTenantScope(client =>
      client.user.findFirst({
        where: {
          email: normalisedEmail,
          company: { code: companyCode.trim(), isActive: true },
        },
        include: {
          company: true,
          employee: { select: { id: true, firstName: true, lastName: true, departmentId: true, status: true } },
        },
      })
    );

    // Hash a dummy password when the user does not exist, so the response time
    // does not reveal whether the account is real.
    if (!user) {
      await this.burnTime();
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE);
    }

    if (user.lockedUntil && isBefore(new Date(), user.lockedUntil)) {
      // The one case that gets its own message: the user needs to know why
      // retrying will not help, and it reveals nothing they do not already know.
      throw new ForbiddenException(
        'Your account has been locked after too many failed sign-in attempts. Contact your HR Manager to unlock it.'
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, password).catch(() => false);

    if (!passwordValid) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE);
    }

    if (!user.isActive || user.employee?.status === 'DEACTIVATED') {
      // Deactivation revokes access immediately (PRD §6.3).
      throw new UnauthorizedException(GENERIC_LOGIN_FAILURE);
    }

    await this.prisma.withoutTenantScope(client =>
      client.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      })
    );

    const tokens = await this.issueTokens(user, user.employee?.id ?? null, user.employee?.departmentId ?? null, {
      familyId: randomUUID(),
      ...meta,
    });

    await this.audit.record(
      { action: 'USER_LOGIN', entityType: 'User', entityId: user.id },
      {
        userId: user.id,
        employeeId: user.employee?.id ?? null,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        permittedCompanyIds: [user.companyId],
        departmentId: user.employee?.departmentId ?? null,
        requestId: randomUUID(),
        ipAddress: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      }
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.employee
          ? `${user.employee.firstName} ${user.employee.lastName}`
          : user.email,
        role: user.role,
        companyId: user.companyId,
        companyName: user.company.name,
        employeeId: user.employee?.id ?? null,
        mustSetPassword: user.mustSetPassword,
      },
    };
  }

  /**
   * Exchange a refresh token for a new pair, rotating the old one.
   *
   * Reuse detection: presenting a token that has already been rotated means
   * someone replayed a stolen copy. We cannot tell attacker from victim, so the
   * whole family is revoked and both are forced to sign in again. Annoying once,
   * versus an attacker holding a session indefinitely.
   */
  async refresh(
    presentedToken: string,
    meta: { ip?: string; userAgent?: string } = {}
  ): Promise<LoginResult> {
    const tokenHash = hashToken(presentedToken);

    const stored = await this.prisma.withoutTenantScope(client =>
      client.refreshToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            include: {
              company: true,
              employee: { select: { id: true, firstName: true, lastName: true, departmentId: true, status: true } },
            },
          },
        },
      })
    );

    if (!stored) throw new UnauthorizedException('Session expired');

    if (stored.rotatedAt || stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; revoked family ${stored.familyId}`
      );
      await this.audit.record({
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        entityType: 'User',
        entityId: stored.userId,
        companyId: stored.user.companyId,
      });
      throw new UnauthorizedException('Session expired');
    }

    if (isBefore(stored.expiresAt, new Date())) {
      throw new UnauthorizedException('Session expired');
    }

    const user = stored.user;
    if (!user.isActive || user.employee?.status === 'DEACTIVATED') {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Session expired');
    }

    await this.prisma.withoutTenantScope(client =>
      client.refreshToken.update({
        where: { id: stored.id },
        data: { rotatedAt: new Date() },
      })
    );

    const tokens = await this.issueTokens(
      user,
      user.employee?.id ?? null,
      user.employee?.departmentId ?? null,
      { familyId: stored.familyId, ...meta }
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.employee
          ? `${user.employee.firstName} ${user.employee.lastName}`
          : user.email,
        role: user.role,
        companyId: user.companyId,
        companyName: user.company.name,
        employeeId: user.employee?.id ?? null,
        mustSetPassword: user.mustSetPassword,
      },
    };
  }

  async logout(presentedToken: string | null): Promise<void> {
    if (!presentedToken) return;

    const stored = await this.prisma.withoutTenantScope(client =>
      client.refreshToken.findUnique({ where: { tokenHash: hashToken(presentedToken) } })
    );
    if (stored) await this.revokeFamily(stored.familyId);
  }

  /**
   * Start a password reset.
   *
   * Always resolves, whether or not the address exists — the caller must not be
   * able to use this to discover who has an account (PRD §6.1's "no field-level
   * hints", applied to the reset flow as well).
   */
  async requestPasswordReset(companyCode: string, email: string): Promise<string | null> {
    const user = await this.prisma.withoutTenantScope(client =>
      client.user.findFirst({
        where: { email: email.trim().toLowerCase(), company: { code: companyCode.trim() } },
      })
    );
    if (!user || !user.isActive) return null;

    const token = randomBytes(32).toString('base64url');
    const ttlHours = this.config.get<number>('PASSWORD_RESET_TTL_HOURS', 24);

    await this.prisma.withoutTenantScope(client =>
      client.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: addHours(new Date(), ttlHours),
        },
      })
    );

    return token;
  }

  /** Single-use, and expires after 24h (PRD §6.1). */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const reset = await this.prisma.withoutTenantScope(client =>
      client.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } })
    );

    if (!reset || reset.usedAt || isBefore(reset.expiresAt, new Date())) {
      throw new UnauthorizedException('This reset link is no longer valid. Request a new one.');
    }

    await this.prisma.withoutTenantScope(async client => {
      await client.$transaction([
        client.passwordReset.update({
          where: { id: reset.id },
          data: { usedAt: new Date() },
        }),
        client.user.update({
          where: { id: reset.userId },
          data: {
            passwordHash: await argon2.hash(newPassword, { type: argon2.argon2id }),
            mustSetPassword: false,
            failedLoginCount: 0,
            lockedUntil: null,
          },
        }),
        // Changing a password ends every existing session.
        client.refreshToken.updateMany({
          where: { userId: reset.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
    });

    await this.audit.record({
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'User',
      entityId: reset.userId,
    });
  }

  static hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async issueTokens(
    user: User,
    employeeId: string | null,
    departmentId: string | null,
    meta: { familyId: string; ip?: string; userAgent?: string }
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const claims: AccessTokenClaims = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      employeeId,
      departmentId,
    };

    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL', '1h');
    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshHours = this.config.get<number>('SESSION_ABSOLUTE_HOURS', 8);

    await this.prisma.withoutTenantScope(client =>
      client.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          familyId: meta.familyId,
          expiresAt: addHours(new Date(), refreshHours),
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      })
    );

    return { accessToken, refreshToken, expiresIn: parseTtlSeconds(accessTtl) };
  }

  private async registerFailedAttempt(user: User): Promise<void> {
    const max = this.config.get<number>('MAX_FAILED_LOGINS', 5);
    const lockMinutes = this.config.get<number>('ACCOUNT_LOCK_MINUTES', 30);
    const next = user.failedLoginCount + 1;

    await this.prisma.withoutTenantScope(client =>
      client.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: next,
          lockedUntil: next >= max ? addMinutes(new Date(), lockMinutes) : null,
        },
      })
    );

    if (next >= max) {
      await this.audit.record({
        action: 'ACCOUNT_LOCKED',
        entityType: 'User',
        entityId: user.id,
        reason: `${next} consecutive failed sign-in attempts`,
        companyId: user.companyId,
      });
    }
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.withoutTenantScope(client =>
      client.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    );
  }

  /** Spend roughly the same time as a real verify, to flatten timing. */
  private async burnTime(): Promise<void> {
    await argon2
      .hash('timing-equalisation', { type: argon2.argon2id })
      .catch(() => undefined);
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** "1h" | "30m" | "45s" -> seconds. */
function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) return 3600;

  const value = Number(match[1]);
  switch (match[2]) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 3600;
  }
}
