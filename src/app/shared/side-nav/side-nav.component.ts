import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { NowNowLogoComponent } from '../nownow-logo/nownow-logo.component';

@Component({
  selector: 'app-side-nav',
  standalone: true,
  imports: [CommonModule, RouterModule, NowNowLogoComponent],
  templateUrl: './side-nav.component.html',
})
export class SideNavComponent {
  constructor(private readonly router: Router) {}

  isActive(url: string): boolean {
    return this.router.isActive(url, {
      paths: 'exact',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
  }
}
