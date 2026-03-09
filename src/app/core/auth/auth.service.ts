import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService, isHttpError } from '../http/api.service';
import { AppError } from '../errors/app-error';
import { mapHttpError } from '../errors/error-mapper';
import { TokenStore, SessionUser } from './token-store';
import { Role, normaliseRole } from './role.model';
import { CompanyContextService } from '../tenant/company-context.service';

export interface LoginPayload {
  companyCode: string;
  username: string;
  password: string;
}

/** What the current dev API returns. Widen carefully as the backend firms up. */
interface LoginResponse {
  token: string;
  type?: string;
  username?: string;
  roles?: string[];
  /** Not yet returned by the dev API — see the fallbacks in toSessionUser(). */
  displayName?: string;
  fullName?: string;
  companyId?: string;
  companyName?: string;
  expiresIn?: number;
}

export type LoginResult = { ok: true } | { ok: false; error: AppError };

/**
 * Authentication and session identity.
 *
 * Differences from the version this replaces:
 *  - the access token lives in memory, not localStorage (PRD §11.2)
 *  - a single normalised Role is derived at login and refused if unrecognised,
 *    instead of stashing an unused roles[] array
 *  - login failures return a mapped AppError with deliberately generic copy,
 *    rather than echoing the backend's message (PRD §6.1)
 *  - concurrent refreshes share one in-flight request
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private tokens = inject(TokenStore);
  private companies = inject(CompanyContextService);

  readonly user = this.tokens.user;
  readonly role = this.tokens.role;
  readonly isAuthenticated = this.tokens.isAuthenticated;
  readonly displayName = computed(() => this.tokens.user()?.displayName ?? '');

  private refreshInFlight: Promise<boolean> | null = null;

  async login(payload: LoginPayload): Promise<LoginResult> {
    try {
      const response = await firstValueFrom(
        // skipAuth: no token to send yet. skipError: the form shows this inline,
        // a modal would be the wrong treatment for a typo'd password.
        this.api.post<LoginResponse>('auth/login', payload, { skipAuth: true, skipError: true })
      );

      if (!response?.token) {
        return {
          ok: false,
          error: {
            kind: 'unknown',
            title: 'Sign in failed',
            message: 'The server did not return a valid session. Try again.',
            presentation: 'inline',
            retryable: true,
          },
        };
      }

      const role = normaliseRole(response.roles);
      if (!role) {
        // Refusing beats guessing: a wrong role would either lock someone out of
        // their own work or hand them access they should not have.
        return {
          ok: false,
          error: {
            kind: 'forbidden',
            title: 'No role assigned',
            message:
              'Your account has no recognised role, so we cannot open the right workspace. Contact your HR Manager.',
            presentation: 'inline',
            retryable: false,
          },
        };
      }

      this.tokens.set(response.token, this.toSessionUser(response, payload, role), response.expiresIn);
      return { ok: true };
    } catch (cause) {
      return {
        ok: false,
        error: isHttpError(cause)
          ? mapHttpError(cause, 'POST')
          : {
              kind: 'unknown',
              title: 'Sign in failed',
              message: 'Something went wrong signing you in. Try again.',
              presentation: 'inline',
              retryable: true,
            },
      };
    }
  }

  /**
   * Mint a new access token from the httpOnly refresh cookie.
   *
   * Returns false when the session cannot be recovered, which is the signal to
   * send the user back to login. Concurrent callers share one request so a burst
   * of 401s does not fire five refreshes.
   */
  refresh(): Promise<boolean> {
    this.refreshInFlight ??= this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async performRefresh(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.api.post<LoginResponse>('auth/refresh', {}, {
          skipAuth: true,
          skipError: true,
          skipLoading: true,
        })
      );
      if (!response?.token) return false;
      this.tokens.replaceToken(response.token, response.expiresIn);
      return true;
    } catch {
      return false;
    }
  }

  /** Best-effort server-side revocation, then local teardown regardless. */
  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.api.post('auth/logout', {}, { skipError: true, skipLoading: true })
      );
    } catch {
      // A failed logout call must never trap the user in a session.
    } finally {
      this.clearSession();
    }
  }

  clearSession(): void {
    this.tokens.clear();
    this.companies.clear();
  }

  private toSessionUser(response: LoginResponse, payload: LoginPayload, role: Role): SessionUser {
    return {
      username: response.username ?? payload.username,
      // The dev API sends no display name yet; fall back to the username so the
      // greeting is never blank.
      displayName: response.displayName ?? response.fullName ?? response.username ?? payload.username,
      role,
      companyId: response.companyId ?? payload.companyCode ?? null,
      companyName: response.companyName ?? null,
    };
  }
}
