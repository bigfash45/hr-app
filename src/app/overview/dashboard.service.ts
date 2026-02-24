import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/http/api.service';

export interface PendingTasks {
  count: number;
  type: string;
  actionLabel: string;
}

export interface UserInfo {
  name: string;
  greeting: string;
  pendingTasks: PendingTasks;
}

export interface TotalEmployees {
  value: number;
  active: string;
  trend: string;
  trendDirection: 'up' | 'down' | 'neutral';
}

export interface Attendance {
  clockedIn: number;
  total: number;
  percentage: number;
  warning: string;
}

export interface OnLeave {
  count: number;
  total: number;
  percentage: number;
  actionLabel: string;
}

export interface DashboardStats {
  totalEmployees: TotalEmployees;
  attendance: Attendance;
  onLeave: OnLeave;
}

export interface DashboardResponse {
  user: UserInfo;
  stats: DashboardStats;
}

export interface DashboardEvent {
  id: number;
  title: string;
  date: string;
  type: 'payroll' | 'holiday' | 'meeting' | string;
}

/**
 * Overview dashboard data.
 *
 * Now routes through ApiService: no base URL, and no hand-built Authorization
 * header reading a token out of localStorage. Auth, tenancy, the progress bar,
 * and error mapping are all handled by the interceptor chain.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private api = inject(ApiService);

  getStats(): Observable<DashboardResponse> {
    return this.api.get<DashboardResponse>('overview/stats');
  }

  getEvents(): Observable<DashboardEvent[]> {
    return this.api.get<DashboardEvent[]>('overview/events');
  }
}
