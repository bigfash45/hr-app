import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { currentTenant } from '../../core/tenant/tenant-context';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';

/**
 * Requires an authenticated caller unless the route is @Public().
 *
 * Registered globally in AppModule, so protection is the default and exposure is
 * the deliberate act.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (!currentTenant()) {
      throw new UnauthorizedException('Authentication required');
    }
    return true;
  }
}

/**
 * Enforces @Roles() (PRD §7.1).
 *
 * This is the real boundary. The Angular `*appHasRole` directive only hides
 * controls — PRD §7.3 is explicit that frontend hiding is supplementary, and a
 * hidden button is still a reachable endpoint.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const tenant = currentTenant();
    if (!tenant) throw new UnauthorizedException('Authentication required');

    if (!required.includes(tenant.role)) {
      throw new ForbiddenException('Your role does not permit this action.');
    }
    return true;
  }
}
