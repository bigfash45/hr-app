import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { TokenStore } from './token-store';

/**
 * Blocks unauthenticated access.
 *
 * Before this existed every page in app.routes.ts was reachable by typing its
 * URL. The requested URL is preserved in `redirectTo` so the user lands where
 * they were headed after signing in, rather than always on the dashboard.
 *
 * This is a convenience boundary, not the security boundary — PRD §7.3 puts that
 * server-side. A user who bypasses this guard still gets 401s from the API.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const tokens = inject(TokenStore);
  const router = inject(Router);

  if (tokens.isAuthenticated()) return true;

  return router.createUrlTree(['/auth/login'], {
    queryParams: state.url === '/' ? {} : { redirectTo: state.url },
  });
};

/** Keeps a signed-in user off the login page. */
export const guestGuard: CanActivateFn = () => {
  const tokens = inject(TokenStore);
  const router = inject(Router);

  return tokens.isAuthenticated() ? router.createUrlTree(['/overview']) : true;
};
