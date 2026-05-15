import { Injectable, inject, signal } from '@angular/core';
import { AppError } from '../errors/app-error';
import { DialogService } from './dialog.service';

export type ToastTone = 'success' | 'info' | 'warn' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** Optional single action, e.g. "Undo" or "View". */
  action?: { label: string; run: () => void };
}

/** Auto-dismiss timings. Errors never auto-dismiss. */
const TIMEOUT_MS: Record<ToastTone, number | null> = {
  success: 4000,
  info: 4000,
  warn: 6000,
  error: null,
};

/**
 * The single entry point for user feedback.
 *
 * The rule this service encodes:
 *   toast  — outcomes the user already expects and can safely ignore
 *   modal  — outcomes the user must read, acknowledge, or act on
 *   inline — anything attached to a specific form field or empty state
 *
 * Components call `success()` / `warn()` directly. Errors go through `show()`,
 * which routes on the AppError's own `presentation` field so the routing
 * decision lives in error-mapper and nowhere else.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private dialog = inject(DialogService);

  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  private nextId = 0;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  success(message: string, action?: Toast['action']): void {
    this.push('success', message, action);
  }

  info(message: string, action?: Toast['action']): void {
    this.push('info', message, action);
  }

  warn(message: string, action?: Toast['action']): void {
    this.push('warn', message, action);
  }

  /**
   * Present an error according to its own presentation rule.
   *
   * Returns true when the error was surfaced globally, false when the caller is
   * expected to render it inline (validation errors on a form, a 404 empty
   * state). Callers can use the return value to decide whether they still need
   * to do something locally.
   */
  show(error: AppError, onRetry?: () => void): boolean {
    switch (error.presentation) {
      case 'modal':
        void this.dialog.error(error, error.retryable ? onRetry : undefined);
        return true;
      case 'toast':
        this.push('error', error.message);
        return true;
      case 'inline':
        // Deliberately silent. The component that made the request owns this one.
        return false;
    }
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this._toasts.update(list => list.filter(t => t.id !== id));
  }

  dismissAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this._toasts.set([]);
  }

  private push(tone: ToastTone, message: string, action?: Toast['action']): void {
    const id = this.nextId++;
    this._toasts.update(list => [...list, { id, tone, message, action }]);

    const timeout = TIMEOUT_MS[tone];
    if (timeout !== null) {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), timeout)
      );
    }
  }
}
