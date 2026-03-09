import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TopNavComponent } from '../shared/top-nav/top-nav.component';
import { SideNavComponent } from '../shared/side-nav/side-nav.component';

interface LeaveBalance {
  type: string;
  days: number;
}

@Component({
  selector: 'app-leave-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TopNavComponent, SideNavComponent],
  templateUrl: './leave.page.html',
})
export class LeavePage {
  // View state
  currentView: 'calendar' | 'submitted' = 'calendar';
  showSuccessBanner = false;

  currentYear = 2024;
  currentMonth = 4; // May (0-indexed)
  weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  selectionStart: Date | null = new Date(2024, 4, 14);
  selectionEnd: Date | null = new Date(2024, 4, 19);

  leaveBalance: LeaveBalance[] = [
    { type: 'Annual Leave', days: 15 },
    { type: 'Casual Leave', days: 15 },
    { type: 'Sick Leave', days: 15 },
    { type: 'Paternity Leave', days: 5 },
  ];

  // Submitted request details
  submittedRequest: {
    leaveType: string;
    startDate: Date | null;
    endDate: Date | null;
    reason: string;
    days: number;
  } | null = null;

  leaveRequest = {
    leaveType: 'Sick Leave',
    reason: ''
  };

  leaveTypes = ['Annual Leave', 'Casual Leave', 'Sick Leave', 'Paternity Leave', 'Maternity Leave', 'Unpaid Leave'];

  get totalAvailable(): number {
    return 20;
  }

  get selectedDays(): number {
    if (!this.selectionStart || !this.selectionEnd) return 0;
    const diff = this.selectionEnd.getTime() - this.selectionStart.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  }

  get remainingBalance(): number {
    const currentBalance = this.leaveBalance.find(b => b.type === this.leaveRequest.leaveType);
    return (currentBalance?.days || 0) - this.selectedDays;
  }

  getCalendarWeeks(): (Date | null)[][] {
    const weeks: (Date | null)[][] = [];
    const firstDay = new Date(this.currentYear, this.currentMonth, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    let currentDate = new Date(startDate);
    
    for (let week = 0; week < 6; week++) {
      const weekDays: (Date | null)[] = [];
      for (let day = 0; day < 7; day++) {
        weekDays.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      weeks.push(weekDays);
    }
    return weeks;
  }

  isCurrentMonth(date: Date | null): boolean {
    if (!date) return false;
    return date.getMonth() === this.currentMonth;
  }

  isSelectionStart(date: Date | null): boolean {
    if (!date || !this.selectionStart) return false;
    return this.isSameDay(date, this.selectionStart);
  }

  isSelectionEnd(date: Date | null): boolean {
    if (!date || !this.selectionEnd) return false;
    return this.isSameDay(date, this.selectionEnd);
  }

  isInRange(date: Date | null): boolean {
    if (!date || !this.selectionStart || !this.selectionEnd) return false;
    return date > this.selectionStart && date < this.selectionEnd;
  }

  isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  onDateClick(date: Date | null) {
    if (!date || !this.isCurrentMonth(date)) return;

    if (!this.selectionStart || (this.selectionStart && this.selectionEnd)) {
      this.selectionStart = date;
      this.selectionEnd = null;
    } else {
      if (date < this.selectionStart) {
        this.selectionEnd = this.selectionStart;
        this.selectionStart = date;
      } else {
        this.selectionEnd = date;
      }
    }
  }

  formatDateRange(): string {
    if (!this.selectionStart) return '';
    const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
    const start = this.selectionStart.toLocaleDateString('en-US', options);
    if (!this.selectionEnd) return start;
    const end = this.selectionEnd.toLocaleDateString('en-US', options);
    return `${start} - ${end}. (${this.selectedDays} days)`;
  }

  submitRequest() {
    this.submittedRequest = {
      leaveType: this.leaveRequest.leaveType,
      startDate: this.selectionStart,
      endDate: this.selectionEnd,
      reason: this.leaveRequest.reason || 'Need to visit the hospital',
      days: this.selectedDays
    };

    // Update leave balance
    const balanceItem = this.leaveBalance.find(b => b.type === this.leaveRequest.leaveType);
    if (balanceItem) {
      balanceItem.days -= this.selectedDays;
    }

    this.currentView = 'submitted';
    this.showSuccessBanner = true;
  }

  cancelRequest() {
    this.selectionStart = null;
    this.selectionEnd = null;
    this.leaveRequest.reason = '';
  }

  dismissBanner() {
    this.showSuccessBanner = false;
  }

  goToCalendar() {
    this.currentView = 'calendar';
    this.showSuccessBanner = false;
    this.selectionStart = null;
    this.selectionEnd = null;
    this.leaveRequest.reason = '';
  }

  editRequest() {
    this.currentView = 'calendar';
    this.showSuccessBanner = false;
  }

  formatSubmittedDates(): string {
    if (!this.submittedRequest?.startDate || !this.submittedRequest?.endDate) return '';
    const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
    const start = this.submittedRequest.startDate.toLocaleDateString('en-US', options);
    const end = this.submittedRequest.endDate.toLocaleDateString('en-US', options);
    return `${start.replace(/, \d{4}/, '')}-${end}`;
  }

  getUpdatedBalance(type: string): number {
    const balance = this.leaveBalance.find(b => b.type === type);
    return balance?.days || 0;
  }
}
