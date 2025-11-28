import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TopNavComponent } from '../shared/top-nav/top-nav.component';
import { SideNavComponent } from '../shared/side-nav/side-nav.component';

@Component({
  selector: 'app-employees-page',
  standalone: true,
  imports: [CommonModule, RouterModule, TopNavComponent, SideNavComponent],
  templateUrl: './employees.page.html',
})
export class EmployeesPage {}
