import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TopNavComponent } from '../shared/top-nav/top-nav.component';
import { SideNavComponent } from '../shared/side-nav/side-nav.component';
import { StatePanelComponent } from '../shared/ui/state-panel/state-panel.component';
import { DashboardService, DashboardEvent } from './dashboard.service';
import { asyncState } from '../core/state/async-state';
import { environment } from '../../environments/environment';

interface DisplayEvent extends DashboardEvent {
  formattedDate: string;
}

/**
 * Overview dashboard.
 *
 * Rewritten off 27 mutable public fields and a manual detectChanges() onto two
 * asyncState() slices plus computed views. The practical difference: a failed
 * request now renders an error state with a retry, instead of logging to the
 * console and leaving every card on zero — which reads as real data.
 */
@Component({
  selector: 'app-overview-page',
  standalone: true,
  imports: [CommonModule, RouterModule, TopNavComponent, SideNavComponent, StatePanelComponent],
  templateUrl: './overview.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewPage implements OnInit {
  private dashboard = inject(DashboardService);

  readonly stats = asyncState(() => this.dashboard.getStats());
  readonly events = asyncState(() => this.dashboard.getEvents());

  // ── Greeting ──────────────────────────────────────────────────────────────
  readonly userName = computed(() => this.stats.data()?.user.name ?? '');
  readonly greeting = computed(() => this.stats.data()?.user.greeting ?? 'Good day');
  readonly pendingTasksCount = computed(() => this.stats.data()?.user.pendingTasks.count ?? 0);
  readonly pendingTasksType = computed(
    () => this.stats.data()?.user.pendingTasks.type ?? 'leave applications'
  );
  readonly pendingTasksAction = computed(
    () => this.stats.data()?.user.pendingTasks.actionLabel ?? 'Review it'
  );

  // ── Stat cards ────────────────────────────────────────────────────────────
  readonly totalEmployees = computed(() => this.stats.data()?.stats.totalEmployees.value ?? 0);
  readonly totalEmployeesActive = computed(
    () => this.stats.data()?.stats.totalEmployees.active ?? ''
  );
  readonly totalEmployeesTrend = computed(
    () => this.stats.data()?.stats.totalEmployees.trend ?? ''
  );
  readonly totalEmployeesTrendDirection = computed(
    () => this.stats.data()?.stats.totalEmployees.trendDirection ?? 'neutral'
  );

  readonly clockedIn = computed(() => this.stats.data()?.stats.attendance.clockedIn ?? 0);
  readonly totalForAttendance = computed(() => this.stats.data()?.stats.attendance.total ?? 0);
  readonly attendancePercentage = computed(
    () => this.stats.data()?.stats.attendance.percentage ?? 0
  );
  readonly attendanceWarning = computed(() => this.stats.data()?.stats.attendance.warning ?? '');

  readonly onLeaveCount = computed(() => this.stats.data()?.stats.onLeave.count ?? 0);
  readonly onLeaveTotal = computed(() => this.stats.data()?.stats.onLeave.total ?? 0);
  readonly onLeavePercentage = computed(() => this.stats.data()?.stats.onLeave.percentage ?? 0);
  readonly onLeaveAction = computed(
    () => this.stats.data()?.stats.onLeave.actionLabel ?? 'View Calendar'
  );

  readonly displayEvents = computed<DisplayEvent[]>(() =>
    (this.events.data() ?? []).map(event => ({
      ...event,
      formattedDate: this.formatEventDate(event.date),
    }))
  );

  /**
   * PLACEHOLDER DATA — no endpoint exists for either of these yet.
   *
   * The employee table and activity feed need `GET /overview/employees` and
   * `GET /overview/activity` (names TBC). These fixtures keep the layout
   * reviewable; replace them with asyncState slices once the endpoints land, and
   * delete this block. They are the last hardcoded data in the page.
   */
  readonly employees = [
    { id: '#D1234', name: 'Elvis Osuji', role: 'Backend Developer', dept: 'Engineering', status: 'On Leave', avatar: 'https://i.pravatar.cc/40?img=12' },
    { id: '#D1234', name: 'Taiwo Adefie', role: 'Frontend Developer', dept: 'Engineering', status: 'Clocked In', avatar: 'https://i.pravatar.cc/40?img=34' },
    { id: '#D1234', name: 'Ayodemeji Fasina', role: 'Frontend Developer', dept: 'Engineering', status: 'Clocked In', avatar: 'https://i.pravatar.cc/40?img=7' },
  ];

  readonly activities = [
    { who: 'Emmanuel Aforinwo', text: 'approved leave request for Babatunde jimoh', time: '1 minutes ago', avatar: 'https://i.pravatar.cc/40?img=15' },
    { who: 'You', text: 'added a new employee: Joan Onyimadu', time: '1 hour ago', avatar: 'https://i.pravatar.cc/40?img=5' },
    { who: 'Adedamola Ademeso', text: 'updated his personal information', time: '1 hour ago', avatar: 'https://i.pravatar.cc/40?img=21' },
  ];

  ngOnInit(): void {
    void this.stats.load();
    void this.events.load();
  }

  /** Weekday plus DD MMM YYYY, in WAT — PRD §10.4. */
  private formatEventDate(value: string): string {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    return formatDate(parsed, 'EEEE, dd MMM yyyy', 'en-US', environment.locale.timeZone);
  }
}
