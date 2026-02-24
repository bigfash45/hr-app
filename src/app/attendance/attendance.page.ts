import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TopNavComponent } from '../shared/top-nav/top-nav.component';
import { SideNavComponent } from '../shared/side-nav/side-nav.component';

interface AttendanceRecord {
  id: number;
  name: string;
  avatar: string;
  department: string;
  clockIn: string;
  clockOut: string;
  status: 'CLOCKED IN' | 'ABSENT' | 'ON LEAVE';
}

@Component({
  selector: 'app-attendance-page',
  standalone: true,
  imports: [CommonModule, RouterModule, TopNavComponent, SideNavComponent],
  templateUrl: './attendance.page.html',
})
export class AttendancePage {
  // Calendar state
  currentYear = 2020;
  currentMonth = 11; // December (0-indexed)
  calendarView: 'month' | 'year' = 'month';
  selectedDay = 17;

  months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  weekDays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // Attendance data
  attendanceRecords: AttendanceRecord[] = [
    { id: 1, name: 'Taiwo Adeife', avatar: 'https://randomuser.me/api/portraits/women/44.jpg', department: 'Engineering', clockIn: '9:02AM', clockOut: '5:03PM', status: 'CLOCKED IN' },
    { id: 2, name: 'Ademeso Adedam...', avatar: 'https://randomuser.me/api/portraits/men/45.jpg', department: 'Engineering', clockIn: '-', clockOut: '', status: 'ABSENT' },
    { id: 3, name: 'Adeusi Victor', avatar: 'https://randomuser.me/api/portraits/men/22.jpg', department: 'Engineering', clockIn: '-', clockOut: '', status: 'ON LEAVE' },
    { id: 4, name: 'Joan Onyimadu', avatar: 'https://randomuser.me/api/portraits/women/65.jpg', department: 'Engineering', clockIn: '9:02AM', clockOut: '5:03PM', status: 'CLOCKED IN' },
    { id: 5, name: 'John Oni', avatar: 'https://randomuser.me/api/portraits/men/32.jpg', department: 'Engineering', clockIn: '9:02AM', clockOut: '5:03PM', status: 'CLOCKED IN' },
    { id: 6, name: 'Babatunde Jimoh', avatar: 'https://randomuser.me/api/portraits/men/55.jpg', department: 'Engineering', clockIn: '9:02AM', clockOut: '5:03PM', status: 'CLOCKED IN' },
  ];

  // Pagination
  currentPage = 1;
  totalPages = 5;

  // Stats
  stats = {
    todayAttendance: 350,
    totalAbsent: 200,
    totalEmployees: 350,
    lateArrivals: 50,
    onLeave: 50,
    yetToClockIn: 100
  };

  getStatusClass(status: string): string {
    switch (status) {
      case 'CLOCKED IN':
        return 'bg-green-100 text-green-700';
      case 'ABSENT':
        return 'bg-red-100 text-red-600';
      case 'ON LEAVE':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  }

  getCalendarDays(): (number | null)[] {
    const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();
    const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(this.currentYear, this.currentMonth, 0).getDate();

    // Adjust for Monday start (0 = Monday, 6 = Sunday)
    const startDay = firstDay === 0 ? 6 : firstDay - 1;

    const days: (number | null)[] = [];

    // Previous month days
    for (let i = startDay - 1; i >= 0; i--) {
      days.push(-(daysInPrevMonth - i));
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    // Next month days
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push(-i - 100); // Negative values > 100 indicate next month
    }

    return days;
  }

  isCurrentMonth(day: number | null): boolean {
    return day !== null && day > 0;
  }

  isPreviousMonth(day: number | null): boolean {
    return day !== null && day < 0 && day > -100;
  }

  isNextMonth(day: number | null): boolean {
    return day !== null && day < -100;
  }

  getDisplayDay(day: number | null): number {
    if (day === null) return 0;
    if (day > 0) return day;
    if (day > -100) return Math.abs(day);
    return Math.abs(day) - 100;
  }

  selectDay(day: number | null) {
    if (day && day > 0) {
      this.selectedDay = day;
    }
  }

  setCalendarView(view: 'month' | 'year') {
    this.calendarView = view;
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  formatClockTime(record: AttendanceRecord): string {
    if (record.clockIn === '-') return '-';
    return `${record.clockIn}/${record.clockOut}`;
  }
}
