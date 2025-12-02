import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { TopNavComponent } from '../../shared/top-nav/top-nav.component';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';
import { LeaveApprovedModalComponent, ApprovalItem } from '../../shared/modals/leave-approved-modal/leave-approved-modal.component';

interface LeaveDetail {
  id: number;
  employee: {
    name: string;
    role: string;
    avatar: string;
  };
  summary: {
    leaveType: string;
    dateRequested: string;
    dateSubmitted: string;
    status: 'PENDING MANAGER' | 'PENDING HR' | 'APPROVED' | 'REJECTED';
    lineManager: string;
    reason: string;
  };
  balances: {
    type: string;
    days: number;
  }[];
}

@Component({
  selector: 'app-leave-detail-page',
  standalone: true,
  imports: [CommonModule, RouterModule, TopNavComponent, SideNavComponent, LeaveApprovedModalComponent],
  templateUrl: './leave-detail.page.html',
})
export class LeaveDetailPage {
  detail?: LeaveDetail;
  showApprovedModal = false;
  approvedModal = {
    leaveType: '',
    dates: '',
    durationDays: 0,
    approvals: [] as ApprovalItem[],
    leaveBalance: 0,
  };

  constructor(private route: ActivatedRoute) {
    const id = Number(this.route.snapshot.paramMap.get('id')) || 1;

    // Mock data. In real app, fetch by id
    const mock: LeaveDetail[] = [
      {
        id: 1,
        employee: {
          name: 'Adeusi Victor',
          role: 'Product Manager, Product',
          avatar: 'https://images.unsplash.com/photo-1601412436009-d964bd02edbc?q=80&w=256&auto=format&fit=crop',
        },
        summary: {
          leaveType: 'Sick Leave',
          dateRequested: 'December 14-December 17, 2025',
          dateSubmitted: 'December 17, 2025',
          status: 'PENDING MANAGER',
          lineManager: 'Declan Rice',
          reason: 'Need to visit the hospital',
        },
        balances: [
          { type: 'Sick Leave Days', days: 12 },
          { type: 'Annual Leave Days', days: 12 },
        ],
      },
      {
        id: 2,
        employee: {
          name: 'Ada Lovelace',
          role: 'Software Engineer',
          avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=256&auto=format&fit=crop',
        },
        summary: {
          leaveType: 'Annual Leave',
          dateRequested: 'July 14-July 16, 2025',
          dateSubmitted: 'July 10, 2025',
          status: 'PENDING HR',
          lineManager: 'Grace Hopper',
          reason: 'Family vacation',
        },
        balances: [
          { type: 'Annual Leave Days', days: 10 },
          { type: 'Sick Leave Days', days: 15 },
        ],
      },
    ];

    this.detail = mock.find(m => m.id === id) || mock[0];
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'PENDING MANAGER':
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

  approveAndShowModal() {
    if (!this.detail) return;

    // Derive simple values from mock data
    const dates = this.detail.summary.dateRequested;
    const leaveType = this.detail.summary.leaveType;
    // Try to infer duration from text like "July 14-July 16, 2025" -> 3 days
    let durationDays = 0;
    try {
      const parts = dates.split('-');
      if (parts.length === 2) {
        const endStr = parts[1].trim();
        const end = new Date(endStr);
        let startStr = parts[0].trim();
        // If the start part has no year, append the end year
        if (!/\d{4}/.test(startStr) && !/,\s*\d{4}/.test(startStr) && !isNaN(end.getTime())) {
          startStr = `${startStr}, ${end.getFullYear()}`;
        }
        const start = new Date(startStr);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          if (!isNaN(diff)) durationDays = Math.max(diff, 1);
        }
      }
    } catch {}
    if (!durationDays) durationDays = 3;

    const approvals: ApprovalItem[] = [
      {
        name: this.detail.summary.lineManager,
        role: 'Manager',
        dateApproved: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      },
      {
        name: 'Tolu Folusho',
        role: 'HR',
        dateApproved: new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      },
    ];

    const leaveBalance = (this.detail.balances[0]?.days ?? 0);

    this.approvedModal = { leaveType, dates, durationDays, approvals, leaveBalance };
    this.showApprovedModal = true;
  }

  closeApprovedModal() {
    this.showApprovedModal = false;
  }
}
