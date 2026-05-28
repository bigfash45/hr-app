import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Per-request opt-outs from the interceptor chain.
 *
 * These exist so a handful of special requests can step around cross-cutting
 * behaviour without anyone reaching for a second HttpClient:
 *
 *  SKIP_AUTH    — don't attach a bearer token (login, token refresh). Also
 *                 prevents the refresh call from recursing through the 401 handler.
 *  SKIP_ERROR   — don't surface failures globally; the caller handles everything
 *                 itself (a form doing its own inline validation display).
 *  SKIP_LOADING — don't count toward the global progress bar (polling, prefetch).
 */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);
export const SKIP_ERROR = new HttpContextToken<boolean>(() => false);
export const SKIP_LOADING = new HttpContextToken<boolean>(() => false);

export interface RequestFlags {
  skipAuth?: boolean;
  skipError?: boolean;
  skipLoading?: boolean;
}

export function contextFrom(flags: RequestFlags = {}): HttpContext {
  const context = new HttpContext();
  if (flags.skipAuth) context.set(SKIP_AUTH, true);
  if (flags.skipError) context.set(SKIP_ERROR, true);
  if (flags.skipLoading) context.set(SKIP_LOADING, true);
  return context;
}
