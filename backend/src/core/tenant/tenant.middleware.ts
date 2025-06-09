import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { TenantContext, runWithTenant } from './tenant-context';
import { AccessTokenClaims } from '../../modules/auth/auth.service';

/**
 * Binds the tenant context for the lifetime of the request.
 *
 * This is middleware rather than a guard because AsyncLocalStorage needs to wrap
 * everything downstream — `runWithTenant(ctx, next)`. A guard returns before the
 * handler runs, so anything it stored would already be out of scope.
 *
 * Requests without a valid token pass through with no context bound. Route
 * protection is JwtAuthGuard's job; this only establishes identity.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Echo the client's correlation id so a user-reported error maps to a log
    // line; mint one if the client sent none.
    const requestId = (req.header('X-Request-Id') || randomUUID()).slice(0, 100);
    res.setHeader('X-Request-Id', requestId);

    const token = extractBearer(req.header('authorization'));
    if (!token) return next();

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      // Expired or forged. Fall through unauthenticated — the guard turns this
      // into a 401, and the client's interceptor turns that into a silent refresh.
      return next();
    }

    const permittedCompanyIds = await this.resolvePermittedCompanies(claims);
    const companyId = this.resolveActiveCompany(req, claims, permittedCompanyIds);

    const context: TenantContext = {
      userId: claims.sub,
      employeeId: claims.employeeId,
      email: claims.email,
      role: claims.role,
      companyId,
      permittedCompanyIds,
      departmentId: claims.departmentId,
      requestId,
      ipAddress: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    };

    runWithTenant(context, () => next());
  }

  /**
   * Which companies this user may act within.
   *
   * Only a Group HR Manager gets more than one (PRD §7.1). The list is read from
   * the database rather than the token so that revoking a company takes effect on
   * the next request, not whenever the access token happens to expire.
   */
  private async resolvePermittedCompanies(claims: AccessTokenClaims): Promise<string[]> {
    if (claims.role !== 'GROUP_HR_MANAGER') return [claims.companyId];

    const companies = await this.prisma.withoutTenantScope(client =>
      client.company.findMany({ where: { isActive: true }, select: { id: true } })
    );
    return companies.map(c => c.id);
  }

  /**
   * Honour X-Company-Id only if the caller is actually permitted that company.
   *
   * This is the check that makes the header safe. Without it, anyone could read
   * another tenant's data by changing one request header — the exact failure
   * PRD §11.4 exists to prevent.
   */
  private resolveActiveCompany(
    req: Request,
    claims: AccessTokenClaims,
    permitted: string[]
  ): string {
    const requested = req.header('X-Company-Id');
    if (!requested) return claims.companyId;

    if (!permitted.includes(requested)) {
      this.logger.warn(
        `User ${claims.sub} (${claims.role}) requested company ${requested} but is not permitted it; falling back to own company.`
      );
      return claims.companyId;
    }
    return requested;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
