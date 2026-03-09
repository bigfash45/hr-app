import { Injectable, computed, signal } from '@angular/core';
import { AppError } from '../errors/app-error';
import {
  ConfirmOptions,
  ConfirmResult,
  DialogRequest,
  SuccessOptions,
  SuccessResult,
} from './dialog.model';

interface QueueEntry {
  request: DialogRequest;
  resolve: (value: unknown) => void;
}

/**
 * Owns every blocking dialog in the app.
 *
 * The API is promise-based so calling code reads top to bottom:
 *
 *   const { confirmed, reason } = await dialog.confirm({ ... });
 *   if (!confirmed) return;
 *
 * Only one dialog is visible at a time. Anything raised while one is open is
 * queued, so a burst of failures can't stack four modals on top of each other.
 * DialogHostComponent renders whatever `current()` holds.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private queue = signal<QueueEntry[]>([]);
  private nextId = 0;

  /** The dialog to render, or null when nothing is open. */
  readonly current = computed(() => this.queue()[0]?.request ?? null);
  readonly isOpen = computed(() => this.queue().length > 0);

  /**
   * Ask the user to confirm. Resolves `{ confirmed: false }` if they cancel or
   * dismiss, so the caller only has one path to check.
   */
  confirm(options: ConfirmOptions): Promise<ConfirmResult> {
    return this.enqueue<ConfirmResult>({
      kind: 'confirm',
      id: this.nextId++,
      options,
    });
  }

  /** Show a milestone confirmation the user should read. */
  success(options: SuccessOptions): Promise<SuccessResult> {
    return this.enqueue<SuccessResult>({
      kind: 'success',
      id: this.nextId++,
      options,
    });
  }

  /**
   * Show a blocking error. `onRetry` is wired to a Retry button — pass it only
   * when re-firing the request is safe (see isRetryableRequest).
   */
  error(error: AppError, onRetry?: () => void): Promise<void> {
    return this.enqueue<void>({
      kind: 'error',
      id: this.nextId++,
      error,
      onRetry,
    });
  }

  /** Called by the host when the visible dialog resolves. */
  close(id: number, result: unknown): void {
    const entry = this.queue().find(e => e.request.id === id);
    if (!entry) return;

    this.queue.update(entries => entries.filter(e => e.request.id !== id));
    entry.resolve(result);
  }

  /** Drop every queued dialog — used on sign-out so nothing survives the session. */
  dismissAll(): void {
    const entries = this.queue();
    this.queue.set([]);
    for (const entry of entries) {
      entry.resolve(entry.request.kind === 'confirm' ? { confirmed: false } : 'dismiss');
    }
  }

  private enqueue<T>(request: DialogRequest): Promise<T> {
    return new Promise<T>(resolve => {
      this.queue.update(entries => [
        ...entries,
        { request, resolve: resolve as (value: unknown) => void },
      ]);
    });
  }
}
