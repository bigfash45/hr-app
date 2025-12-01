import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../employee-details/employee-details.component';

@Component({
  selector: 'app-employee-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './employee-list.component.html',
})
export class EmployeeListComponent {
  @Input() employees: Employee[] = [];
  @Output() viewDetails = new EventEmitter<Employee>();

  currentPage = 1;
  totalPages = 5;

  onViewDetails(employee: Employee) {
    this.viewDetails.emit(employee);
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }
}
