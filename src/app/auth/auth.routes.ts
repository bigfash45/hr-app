import { Routes } from '@angular/router';
import { guestGuard } from '../core/auth/auth.guard';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    // A signed-in user hitting /auth/login goes to their dashboard instead.
    canActivate: [guestGuard],
    loadComponent: () => import('./login.page').then(m => m.LoginPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
];
