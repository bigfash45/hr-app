import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface Employee {
  id: number;
  name: string;
  avatar: string;
  contactType: string;
  role: string;
  department: string;
  attendance: string;
  employeeId?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  workEmail?: string;
  personalEmail?: string;
  phoneNumber?: string;
  address?: string;
  employeeType?: string;
  hireDate?: string;
  reportingManager?: string;
  organisation?: string;
}

@Component({
  selector: 'app-employee-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './employee-details.component.html',
})
export class EmployeeDetailsComponent {
  @Input() employee: Employee | null = null;
  @Output() back = new EventEmitter<void>();

  activeTab = 'overview'; // 'overview' | 'leave' | 'documents' | 'performance'

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  goBack() {
    this.back.emit();
  }
}
