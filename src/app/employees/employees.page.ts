import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TopNavComponent } from '../shared/top-nav/top-nav.component';
import { SideNavComponent } from '../shared/side-nav/side-nav.component';
import { EmployeeListComponent } from './components/employee-list/employee-list.component';
import { EmployeeDetailsComponent, Employee } from './components/employee-details/employee-details.component';
import { LeaveRequestsComponent } from './components/leave-requests/leave-requests.component';
import { AddEmployeeComponent } from './components/add-employee/add-employee.component';
import { OrgChartComponent } from './components/org-chart/org-chart.component';

@Component({
  selector: 'app-employees-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TopNavComponent,
    SideNavComponent,
    EmployeeListComponent,
    EmployeeDetailsComponent,
    LeaveRequestsComponent,
    AddEmployeeComponent,
    OrgChartComponent
  ],
  templateUrl: './employees.page.html',
})
export class EmployeesPage {
  // View state: 'list' | 'details' | 'add'
  currentView: 'list' | 'details' | 'add' = 'list';
  activeTab = 'employees'; // 'employees' | 'org' | 'leave'
  selectedEmployee: Employee | null = null;

  // Employees data
  employees: Employee[] = [
    { id: 1, name: 'Charlene Reed', avatar: 'https://randomuser.me/api/portraits/women/68.jpg', contactType: 'Onsite-Fulltime', role: 'Quality Assurance', department: 'Engineering', attendance: '120h 45m', employeeId: '#D234', dateOfBirth: 'October 24, 1992', gender: 'Female', nationality: 'Nigerian', workEmail: 'charlene.reed@email.com', personalEmail: 'charlenereed@myemail.com', phoneNumber: '+234 905 839 9274', address: '54, Olawale Street, Lagos', employeeType: 'Full-Time', hireDate: 'October 24, 1992', reportingManager: 'Emmanuel Aforinwo', organisation: 'Now Now Digitals' },
    { id: 2, name: 'Elvis Osuji', avatar: 'https://randomuser.me/api/portraits/men/32.jpg', contactType: 'Onsite-Fulltime', role: 'Backend Developer', department: 'Engineering', attendance: '120h 45m', employeeId: '#D235', gender: 'Male', nationality: 'Nigerian' },
    { id: 3, name: 'Taiwo Adeife', avatar: 'https://randomuser.me/api/portraits/women/44.jpg', contactType: 'Onsite-Fulltime', role: 'Frontend Developer', department: 'Engineering', attendance: '120h 45m', employeeId: '#D236', gender: 'Female', nationality: 'Nigerian' },
    { id: 4, name: 'Ademeso Adedam...', avatar: 'https://randomuser.me/api/portraits/men/45.jpg', contactType: 'Onsite-Fulltime', role: 'UI/UX Designer', department: 'Engineering', attendance: '120h 45m', employeeId: '#D237', gender: 'Male', nationality: 'Nigerian' },
    { id: 5, name: 'Adeusi Victor', avatar: 'https://randomuser.me/api/portraits/men/22.jpg', contactType: 'Onsite-Fulltime', role: 'Product Manager', department: 'Engineering', attendance: '120h 45m', employeeId: '#D238', gender: 'Male', nationality: 'Nigerian' },
    { id: 6, name: 'Joan Onyimadu', avatar: 'https://randomuser.me/api/portraits/women/65.jpg', contactType: 'Onsite-Fulltime', role: 'Q/A Engineer', department: 'Engineering', attendance: '120h 45m', employeeId: '#D239', gender: 'Female', nationality: 'Nigerian' },
  ];

  // Leave requests data
  leaveRequests = [
    { id: 1, name: 'Elvis Osuji', avatar: 'https://randomuser.me/api/portraits/men/32.jpg', leaveType: 'Casual Leave', leaveFrom: 'Jan 12, 2025', leaveTo: 'Jan 14, 2025', days: 2, status: 'PENDING MANAGER' },
    { id: 2, name: 'Taiwo Adeife', avatar: 'https://randomuser.me/api/portraits/women/44.jpg', leaveType: 'Sick Leave', leaveFrom: 'Jan 12, 2025', leaveTo: 'Jan 14, 2025', days: 1, status: 'PENDING HR' },
    { id: 3, name: 'Ademeso Adedam...', avatar: 'https://randomuser.me/api/portraits/men/45.jpg', leaveType: 'Sick Leave', leaveFrom: 'Jan 12, 2025', leaveTo: 'Jan 14, 2025', days: 3, status: 'APPROVED' },
    { id: 4, name: 'Adeusi Victor', avatar: 'https://randomuser.me/api/portraits/men/22.jpg', leaveType: 'Casual Leave', leaveFrom: 'Jan 12, 2025', leaveTo: 'Jan 14, 2025', days: 4, status: 'APPROVED' },
    { id: 5, name: 'Joan Onyimadu', avatar: 'https://randomuser.me/api/portraits/women/65.jpg', leaveType: 'Casual Leave', leaveFrom: 'Jan 12, 2025', leaveTo: 'Jan 14, 2025', days: 1, status: 'APPROVED' },
  ];

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  openAddEmployee() {
    this.currentView = 'add';
  }

  closeAddEmployee() {
    this.currentView = 'list';
  }

  viewEmployeeDetails(employee: Employee) {
    this.selectedEmployee = employee;
    this.currentView = 'details';
  }

  backToList() {
    this.selectedEmployee = null;
    this.currentView = 'list';
  }
}
