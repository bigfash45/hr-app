import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NowNowLogoComponent } from '../nownow-logo/nownow-logo.component';

@Component({
  selector: 'app-top-nav',
  standalone: true,
  imports: [CommonModule, NowNowLogoComponent],
  templateUrl: './top-nav.component.html',
})
export class TopNavComponent {}
