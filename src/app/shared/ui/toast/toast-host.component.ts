import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeedbackService, ToastTone } from '../../../core/feedback/feedback.service';

/**
 * Renders the toast queue. Mounted once in app.html.
 *
 * Accessibility (PRD §10.3): the region is a live region so screen readers
 * announce toasts without moving focus. Errors are assertive (interrupt),
 * everything else is polite (waits for a pause). Each tone carries an icon as
 * well as a colour — colour alone is never the signal.
 */
@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast-host.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  private feedback = inject(FeedbackService);

  readonly toasts = this.feedback.toasts;

  private readonly TONE_CLASS: Record<ToastTone, string> = {
    success: 'bg-success-container text-on-success-container',
    info: 'bg-primary-container text-on-primary-container',
    warn: 'bg-warning-container text-on-warning-container',
    error: 'bg-error-container text-on-error-container',
  };

  /** Screen-reader prefix, so the tone survives without colour. */
  private readonly TONE_LABEL: Record<ToastTone, string> = {
    success: 'Success:',
    info: 'Information:',
    warn: 'Warning:',
    error: 'Error:',
  };

  // Methods rather than direct map indexing: the toast reaching the template via
  // ngTemplateOutlet has an untyped context, and indexing a Record with `any`
  // trips TS7053 under strict template checking.
  protected toneClass(tone: ToastTone): string {
    return this.TONE_CLASS[tone];
  }

  protected toneLabel(tone: ToastTone): string {
    return this.TONE_LABEL[tone];
  }

  protected dismiss(id: number): void {
    this.feedback.dismiss(id);
  }

  protected runAction(id: number, run: () => void): void {
    this.feedback.dismiss(id);
    run();
  }
}
