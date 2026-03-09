import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppError } from '../../../core/errors/app-error';
import { ViewState } from '../../../core/state/view-state';
import { SkeletonComponent } from '../skeleton/skeleton.component';

export type { ViewState };

/**
 * Renders the three non-ready states every async screen must have — PRD §15.4
 * lists "loading, empty, and error states designed and implemented" as a
 * Definition of Done item, and today not one screen has them.
 *
 * Deliberately does NOT project content for the ready state. Content inside a
 * conditional <ng-content> is still instantiated by the parent, which would run
 * child component constructors (and their requests) while the screen is still
 * loading. So consumers branch explicitly:
 *
 *   @if (state() === 'ready') {
 *     ...the real content...
 *   } @else {
 *     <app-state-panel [state]="state()" [error]="error()" (retry)="load()" />
 *   }
 */
@Component({
  selector: 'app-state-panel',
  standalone: true,
  imports: [CommonModule, SkeletonComponent],
  templateUrl: './state-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatePanelComponent {
  @Input({ required: true }) state!: ViewState;

  /** Present when state is 'error'. */
  @Input() error: AppError | null = null;

  /** Loading skeleton shape. Match it to the content it stands in for. */
  @Input() skeleton: 'card' | 'table' | 'list' | 'text' = 'card';
  @Input() skeletonRows = 3;

  @Input() emptyTitle = 'Nothing here yet';
  @Input() emptyMessage = '';
  /** Shows a call-to-action button in the empty state when set. */
  @Input() emptyActionLabel = '';

  /** What the loading state announces to screen readers. */
  @Input() loadingLabel = 'Loading';

  @Output() retry = new EventEmitter<void>();
  @Output() emptyAction = new EventEmitter<void>();

  protected get rows(): number[] {
    return Array.from({ length: Math.max(1, this.skeletonRows) }, (_, i) => i);
  }
}
