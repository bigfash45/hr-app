import { Injectable, computed, signal } from '@angular/core';
import { Role } from './role.model';

export interface SessionUser {
  username: string;
  displayName: string;
  role: Role;
  /** Tenant the user belongs to — PRD §11.4 tags every record with a company. */
  companyId: string | null;
  companyName: string | null;
}

/**
 * Holds the access token and the identity derived from it — in memory only.
 *
 * Deliberately NOT localStorage. The previous implementation kept the JWT in
 * localStorage, where any injected script can read it, and PRD §11.2 calls for a
 * 1-hour JWT with refresh-token rotation. In-memory means a tab refresh loses
 * the access token and we silently re-mint it from the refresh token, which the
 * backend should hold in an httpOnly, Secure, SameSite cookie.
 *
 * Backend requirement (plan decision D2): expose
 *   POST /auth/refresh   — reads the httpOnly cookie, returns a new access token
 *   POST /auth/logout    — clears the cookie server-side
 * Until those exist, a page reload will drop the session and land on login.
 * That is a visible inconvenience, not a security hole, and it is the right way
 * round of the trade.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<SessionUser | null>(null);
  /** Epoch ms at which the access token stops being valid. */
  private readonly _expiresAt = signal<number | null>(null);

  readonly accessToken = this._accessToken.asReadonly();
  readonly user = this._user.asReadonly();
  readonly role = computed(() => this._user()?.role ?? null);
  readonly isAuthenticated = computed(() => this._accessToken() !== null);

  /** True when the token is gone or within `skewMs` of expiring. */
  expiresWithin(skewMs = 30_000): boolean {
    const expiresAt = this._expiresAt();
    if (expiresAt === null) return false;
    return Date.now() >= expiresAt - skewMs;
  }

  set(token: string, user: SessionUser, expiresInSeconds?: number): void {
    this._accessToken.set(token);
    this._user.set(user);
    this._expiresAt.set(
      expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : readJwtExpiry(token)
    );
  }

  /** Swap the token, keeping the identity — used after a silent refresh. */
  replaceToken(token: string, expiresInSeconds?: number): void {
    this._accessToken.set(token);
    this._expiresAt.set(
      expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : readJwtExpiry(token)
    );
  }

  setCompany(companyId: string | null, companyName: string | null): void {
    this._user.update(user => (user ? { ...user, companyId, companyName } : user));
  }

  clear(): void {
    this._accessToken.set(null);
    this._user.set(null);
    this._expiresAt.set(null);
  }
}

/**
 * Read `exp` from a JWT payload without verifying the signature.
 *
 * Safe because this is only used to decide when to refresh early. The server is
 * the sole authority on whether a token is valid — we never trust these claims
 * for an access decision.
 */
function readJwtExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}
