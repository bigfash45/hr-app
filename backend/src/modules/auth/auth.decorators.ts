import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Role } from '@prisma/client';
import { TenantContext, currentTenant } from '../../core/tenant/tenant-context';

export const IS_PUBLIC_KEY = 'auth:public';
export const ROLES_KEY = 'auth:roles';

/**
 * Opts a route out of authentication.
 *
 * Authentication is on by default (JwtAuthGuard is registered globally), so
 * forgetting a decorator leaves an endpoint protected rather than exposed —
 * which is the right way round for the failure.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Restricts a route to the listed roles (PRD §7.1).
 *
 * Always list every permitted role explicitly. Roles are not cumulative — a
 * Line Manager does not inherit HR rights — so there is no "minimum level"
 * shorthand on purpose.
 *
 *   @Roles('LOCAL_HR_MANAGER', 'GROUP_HR_MANAGER')
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the current tenant context into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): TenantContext | null => currentTenant()
);
