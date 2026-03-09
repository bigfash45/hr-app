import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogService } from '../../../core/feedback/dialog.service';
import { ConfirmOptions, SuccessOptions } from '../../../core/feedback/dialog.model';
import { AppError } from '../../../core/errors/app-error';
import { FocusTrapDirective } from './focus-trap.directive';

/**
 * Renders the one dialog DialogService currently has open. Mounted once, in
 * app.html — features never place a dialog in their own template.
 *
 * Accessibility (PRD §10.3):
 *  - role="alertdialog" for confirms and errors, role="dialog" for successes
 *  - aria-modal, labelled by its heading and described by its body
 *  - focus trapped inside, restored to the trigger on close
 *  - Escape closes, except when the session has expired and there is nowhere to go back to
 *  - the backdrop is not the only way out; every dialog has a real button
 */
@Component({
  selector: 'app-dialog-host',
  standalone: true,
  imports: [CommonModule, FormsModule, FocusTrapDirective],
  templateUrl: './dialog-host.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class DialogHostComponent {
  private dialogs = inject(DialogService);

  readonly current = this.dialogs.current;

  /** Typed reason for confirms that require one (PRD §6.3, §6.4, §6.5). */
  readonly reason = signal('');
  readonly reasonTouched = signal(false);

  readonly confirmOptions = computed<ConfirmOptions | null>(() => {
    const request = this.current();
    return request?.kind === 'confirm' ? request.options : null;
  });

  readonly successOptions = computed<SuccessOptions | null>(() => {
    const request = this.current();
    return request?.kind === 'success' ? request.options : null;
  });

  readonly error = computed<AppError | null>(() => {
    const request = this.current();
    return request?.kind === 'error' ? request.error : null;
  });

  /** A confirm needing a reason stays disabled until one is typed. */
  readonly reasonMissing = computed(() => {
    const options = this.confirmOptions();
    return !!options?.requireReason && this.reason().trim().length === 0;
  });

  /**
   * An expired session has no "cancel" — dismissing it would leave the user on
   * a page whose data they can no longer refresh.
   */
  readonly dismissible = computed(() => this.error()?.kind !== 'auth');

  /** Narrowed here rather than in the template, so strict template checking is happy. */
  readonly canRetry = computed(() => {
    const request = this.current();
    return request?.kind === 'error' && typeof request.onRetry === 'function';
  });

  protected onEscape(): void {
    const request = this.current();
    if (!request || !this.dismissible()) return;

    if (request.kind === 'confirm') this.cancel();
    else this.dismiss();
  }

  protected confirm(): void {
    const request = this.current();
    if (request?.kind !== 'confirm') return;

    if (this.reasonMissing()) {
      this.reasonTouched.set(true);
      return;
    }

    const reason = this.reason().trim();
    this.resetReason();
    this.dialogs.close(request.id, { confirmed: true, reason: reason || undefined });
  }

  protected cancel(): void {
    const request = this.current();
    if (request?.kind !== 'confirm') return;
    this.resetReason();
    this.dialogs.close(request.id, { confirmed: false });
  }

  protected resolveSuccess(result: 'primary' | 'secondary'): void {
    const request = this.current();
    if (request?.kind !== 'success') return;
    this.dialogs.close(request.id, result);
  }

  protected retry(): void {
    const request = this.current();
    if (request?.kind !== 'error') return;
    const onRetry = request.onRetry;
    this.dialogs.close(request.id, undefined);
    onRetry?.();
  }

  protected dismiss(): void {
    const request = this.current();
    if (!request) return;
    if (request.kind === 'confirm') {
      this.cancel();
      return;
    }
    this.dialogs.close(request.id, request.kind === 'success' ? 'dismiss' : undefined);
  }

  protected async copyReference(reference: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(reference);
    } catch {
      // Clipboard permission denied — the reference is visible on screen anyway.
    }
  }

  private resetReason(): void {
    this.reason.set('');
    this.reasonTouched.set(false);
  }
}
