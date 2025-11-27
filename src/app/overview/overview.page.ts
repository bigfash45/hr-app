import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NowNowLogoComponent } from '../shared/nownow-logo/nownow-logo.component';

@Component({
  selector: 'app-overview-page',
  standalone: true,
  imports: [CommonModule, NowNowLogoComponent],
  templateUrl: './overview.page.html',
})
export class OverviewPage {
  employees = [
    { id: '#D1234', name: 'Elvis Osuji', role: 'Backend Developer', dept: 'Engineering', status: 'On Leave', avatar: 'https://i.pravatar.cc/40?img=12' },
    { id: '#D1234', name: 'Taiwo Adefie', role: 'Frontend Developer', dept: 'Engineering', status: 'Clocked In', avatar: 'https://i.pravatar.cc/40?img=34' },
    { id: '#D1234', name: 'Ayodemeji Fasina', role: 'Frontend Developer', dept: 'Engineering', status: 'Clocked In', avatar: 'https://i.pravatar.cc/40?img=7' },
  ];

  activities = [
    { who: 'Emmanuel Aforinwo', text: 'approved leave request for Babatunde jimoh', time: '1 minutes ago', avatar: 'https://i.pravatar.cc/40?img=15' },
    { who: 'You', text: 'added a new employee: Joan Onyimadu', time: '1 hour ago', avatar: 'https://i.pravatar.cc/40?img=5' },
    { who: 'Adedamola Ademeso', text: 'updated his personal information', time: '1 hour ago', avatar: 'https://i.pravatar.cc/40?img=21' },
  ];

  events = [
    { title: 'Public Holiday: Christmas', date: 'Wednesday December. 25 2025' },
    { title: 'Payroll Run Due', date: 'Monday December. 29 2025' },
    { title: 'Public Holiday: New Years', date: 'Wednesday December. 1 2026' },
  ];
}
