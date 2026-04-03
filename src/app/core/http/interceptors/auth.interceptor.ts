import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { TokenStore } from '../../auth/token-store';
import { AuthService } from '../../auth/auth.service';
import { SKIP_AUTH } from '../http-context';

/**
 * Attaches the bearer token, and recovers from an expired one.
 *
 * On a 401 that is not a login attempt, we try exactly one silent refresh and
 * replay the original request. If the refresh fails, the error is rethrown for
 * the error interceptor to turn into the session-expired dialog — this
 * interceptor never navigates, because losing the user's half-filled leave form
 * to a redirect is precisely what PRD §6.1 forbids.
 *
 * Requests flagged skipAuth (login, refresh) pass straight through, which also
 * stops the refresh call from recursing into itself.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_AUTH)) return next(req);

  const tokens = inject(TokenStore);
  const auth = inject(AuthService);

  return next(withToken(req, tokens.accessToken())).pipe(
    catchError((error: unknown) => {
      const isUnauthorised = error instanceof HttpErrorResponse && error.status === 401;
      if (!isUnauthorised) return throwError(() => error);

      return from(auth.refresh()).pipe(
        switchMap(refreshed => {
          if (!refreshed) return throwError(() => error);
          // Retry once with the new token. A second 401 falls through to the
          // error interceptor rather than looping.
          return next(withToken(req, tokens.accessToken()));
        })
      );
    })
  );
};

function withToken<T>(req: HttpRequest<T>, token: string | null): HttpRequest<T> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}
