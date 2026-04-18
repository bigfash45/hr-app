import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { TokenStore } from './token-store';
import { Role } from './role.model';
import { FeedbackService } from '../feedback/feedback.service';

/**
 * Restricts a route to specific roles — PRD §7.1.
 *
 * Roles are not cumulative, so the allowed set is always listed explicitly:
 *
 *   {
 *     path: 'reports',
 *     canActivate: [authGuard, roleGuard('GROUP_HR_MANAGER', 'LOCAL_HR_MANAGER')],
 *     loadComponent: ...
 *   }
 *
 * A denied navigation shows the same "you don't have access" dialog the API's
 * 403 would produce, so the two paths feel like one rule rather than two.
 */
export function roleGuard(...allowed: Role[]): CanActivateFn {
  return () => {
    const tokens = inject(TokenStore);
    const router = inject(Router);
    const feedback = inject(FeedbackService);

    const role = tokens.role();
    if (role && allowed.includes(role)) return true;

    feedback.show({
      kind: 'forbidden',
      title: "You don't have access to this",
      message:
        'Your role does not permit this page. If you believe this is wrong, contact your HR Manager.',
      presentation: 'modal',
      retryable: false,
    });

    // Unauthenticated users belong on login; signed-in users go home rather than
    // to a dead end.
    return router.createUrlTree([role ? '/overview' : '/auth/login']);
  };
}
