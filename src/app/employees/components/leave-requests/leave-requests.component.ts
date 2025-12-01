import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface LeaveRequest {
  id: number;
  name: string;
  avatar: string;
  leaveType: string;
  leaveFrom: string;
  leaveTo: string;
  days: number;
  status: string;
}

@Component({
  selector: 'app-leave-requests',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leave-requests.component.html',
})
export class LeaveRequestsComponent {
  @Input() leaveRequests: LeaveRequest[] = [];

  currentPage = 1;
  totalPages = 5;

  getStatusClass(status: string): string {
    switch (status) {
      case 'PENDING MANAGER':
        return 'bg-orange-100 text-orange-600';
      case 'PENDING HR':
        return 'bg-orange-100 text-orange-600';
      case 'APPROVED':
        return 'bg-green-100 text-green-600';
      case 'REJECTED':
        return 'bg-red-100 text-red-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }
}
