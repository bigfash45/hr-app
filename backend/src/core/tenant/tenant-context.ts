import { AsyncLocalStorage } from 'node:async_hooks';
import { Role } from '@prisma/client';

/**
 * Who is making the current request, and what they are allowed to see.
 *
 * Derived from the verified JWT — never from a client-supplied header. The
 * frontend sends X-Company-Id for Group HR drill-down, but that is a *request*,
 * validated against `permittedCompanyIds` before it is honoured. Trusting it
 * directly would let anyone read another company's data by editing one header.
 */
export interface TenantContext {
  userId: string;
  employeeId: string | null;
  email: string;
  role: Role;

  /** The company being acted within, after validation. */
  companyId: string;

  /** Group HR may act within any company; everyone else has exactly one. */
  permittedCompanyIds: string[];

  /** Set for a Line Manager, so team-scoped queries can filter by it. */
  departmentId: string | null;

  /** Correlates every log line and audit entry for this request. */
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Runs `fn` with the given tenant context bound to the async execution path,
 * so anything downstream can read it without threading it through every call.
 */
export function runWithTenant<T>(context: TenantContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** The current context, or null on unauthenticated paths (login, health). */
export function currentTenant(): TenantContext | null {
  return storage.getStore() ?? null;
}

/**
 * The current context, or throw.
 *
 * Use this anywhere the absence of a tenant is a bug rather than a valid state.
 * Failing loudly beats defaulting to "some company" and writing a row into the
 * wrong tenant.
 */
export function requireTenant(): TenantContext {
  const context = storage.getStore();
  if (!context) {
    throw new Error(
      'No tenant context bound to this request. A query ran outside the tenant middleware.'
    );
  }
  return context;
}

export function isGroupHr(context: TenantContext | null = currentTenant()): boolean {
  return context?.role === 'GROUP_HR_MANAGER';
}
