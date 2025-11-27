import { Routes } from '@angular/router';
import { LoginPage } from './login.page';

export const AUTH_ROUTES: Routes = [
  { path: 'login', component: LoginPage },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
];
