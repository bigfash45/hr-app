import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.routes').then(m => m.AUTH_ROUTES),
  },
  {
    path: 'overview',
    loadComponent: () => import('./overview/overview.page').then(m => m.OverviewPage),
  },
  {
    path: 'employees',
    loadComponent: () => import('./employees/employees.page').then(m => m.EmployeesPage),
  },
  {
    path: 'attendance',
    loadComponent: () => import('./attendance/attendance.page').then(m => m.AttendancePage),
  },
  {
    path: 'leave',
    loadComponent: () => import('./leave/leave.page').then(m => m.LeavePage),
  },
  {
    path: 'leave/history',
    loadComponent: () => import('./leave/history/leave-history.page').then(m => m.LeaveHistoryPage),
  },
  {
    path: 'leave/detail/:id',
    loadComponent: () => import('./leave/detail/leave-detail.page').then(m => m.LeaveDetailPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  { path: '**', redirectTo: 'auth/login' },
];
