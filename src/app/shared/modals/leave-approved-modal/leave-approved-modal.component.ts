import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ApprovalItem {
  name: string;
  role: string;
  dateApproved: string; // formatted date string
}

@Component({
  selector: 'app-leave-approved-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leave-approved-modal.component.html'
})
export class LeaveApprovedModalComponent {
  @Input() leaveType: string = 'Annual Leave';
  @Input() dates: string = '';
  @Input() durationDays: number = 0;
  @Input() approvals: ApprovalItem[] = [];
  @Input() leaveBalance: number = 0;

  @Output() close = new EventEmitter<void>();

  onClose() {
    this.close.emit();
  }
}
