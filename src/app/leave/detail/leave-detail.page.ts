import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { TopNavComponent } from '../../shared/top-nav/top-nav.component';
import { SideNavComponent } from '../../shared/side-nav/side-nav.component';

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
  imports: [CommonModule, RouterModule, TopNavComponent, SideNavComponent],
  templateUrl: './leave-detail.page.html',
})
export class LeaveDetailPage {
  detail?: LeaveDetail;

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
}
