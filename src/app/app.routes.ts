import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

/**
 * Every authenticated route sits behind authGuard. Before this, each page was
 * reachable by typing its URL while signed out.
 *
 * Role restrictions go on individually with roleGuard(...) as those screens land
 * — payslip upload is Local HR only, cross-company reporting is Group HR only
 * (PRD §7.1). Roles are not cumulative, so each route lists its allowed set
 * explicitly rather than a minimum rank.
 */
export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.routes').then(m => m.AUTH_ROUTES),
  },
  {
    path: 'overview',
    canActivate: [authGuard],
    loadComponent: () => import('./overview/overview.page').then(m => m.OverviewPage),
  },
  {
    path: 'employees',
    canActivate: [authGuard],
    loadComponent: () => import('./employees/employees.page').then(m => m.EmployeesPage),
  },
  {
    path: 'attendance',
    canActivate: [authGuard],
    loadComponent: () => import('./attendance/attendance.page').then(m => m.AttendancePage),
  },
  {
    path: 'leave',
    canActivate: [authGuard],
    loadComponent: () => import('./leave/leave.page').then(m => m.LeavePage),
  },
  {
    path: 'leave/history',
    canActivate: [authGuard],
    loadComponent: () => import('./leave/history/leave-history.page').then(m => m.LeaveHistoryPage),
  },
  {
    path: 'leave/detail/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./leave/detail/leave-detail.page').then(m => m.LeaveDetailPage),
  },
  // Signed-in users land on the dashboard; authGuard bounces everyone else to
  // login while preserving where they were going.
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  { path: '**', redirectTo: 'overview' },
];
