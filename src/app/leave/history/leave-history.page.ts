import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TopNavComponent } from '../../shared/top-nav/top-nav.component';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';
import { LeaveRequestsComponent, LeaveRequest } from '../../employees/components/leave-requests/leave-requests.component';

@Component({
  selector: 'app-leave-history-page',
  standalone: true,
  imports: [CommonModule, RouterModule, TopNavComponent, SideNavComponent, LeaveRequestsComponent],
  templateUrl: './leave-history.page.html',
})
export class LeaveHistoryPage {
  // Sample history data (could be replaced by API later)
  leaveHistory: LeaveRequest[] = [
    { id: 1, name: '', avatar: '', leaveType: 'Sick Leave', leaveFrom: 'July 14, 2025', leaveTo: 'July 16, 2025', days: 2, status: 'PENDING MANAGER' },
    { id: 2, name: '', avatar: '', leaveType: 'Annual Leave', leaveFrom: 'July 14, 2025', leaveTo: 'July 16, 2025', days: 2, status: 'PENDING HR' },
    { id: 3, name: '', avatar: '', leaveType: 'Sick Leave', leaveFrom: 'July 14, 2025', leaveTo: 'July 16, 2025', days: 2, status: 'APPROVED' },
    { id: 4, name: '', avatar: '', leaveType: 'Casual Leave', leaveFrom: 'June 05, 2025', leaveTo: 'June 06, 2025', days: 2, status: 'REJECTED' },
  ];
}
