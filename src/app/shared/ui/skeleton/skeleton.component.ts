import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * A single shimmering placeholder block. Size it from the outside with utility
 * classes so it matches whatever it stands in for:
 *
 *   <app-skeleton class="h-4 w-32" />
 *   <app-skeleton shape="circle" class="h-9 w-9" />
 *
 * The shimmer is wrapped in motion-safe:, so it holds still for anyone with
 * prefers-reduced-motion set (PRD §10.3).
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[class]': 'hostClass',
  },
})
export class SkeletonComponent {
  @Input() shape: 'rect' | 'circle' = 'rect';

  protected get hostClass(): string {
    return [
      'block bg-surface-variant motion-safe:animate-shimmer',
      this.shape === 'circle' ? 'rounded-full' : 'rounded',
    ].join(' ');
  }
}
