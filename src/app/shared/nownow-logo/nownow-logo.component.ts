import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-nownow-logo',
  standalone: true,
  templateUrl: './nownow-logo.component.html',
})
export class NowNowLogoComponent {
  @Input() variant: 'default' | 'black' = 'default';

  get src(): string {
    return this.variant === 'black'
      ? '/assets/images/nownow-logo-black.png'
      : '/assets/images/nownow-logo.png';
  }
}
