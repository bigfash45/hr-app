import { Signal, computed, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { AppError, isAppError } from '../errors/app-error';
import { appErrorFromUnknown } from '../errors/error-mapper';
import { ViewState } from './view-state';

export interface AsyncState<T> {
  /** 'loading' | 'ready' | 'empty' | 'error' — feed straight into <app-state-panel>. */
  readonly state: Signal<ViewState>;
  readonly data: Signal<T | null>;
  readonly error: Signal<AppError | null>;
  /** True while a request is in flight, including a refresh over existing data. */
  readonly busy: Signal<boolean>;
  /** Run the loader. Safe to call again for retry and refresh. */
  load(): Promise<void>;
  /** Replace the held value without a request (optimistic updates). */
  set(value: T): void;
}

/**
 * Wraps an Observable-returning loader in the four-state model every screen
 * needs, so pages stop hand-rolling `isLoading` booleans and swallowing errors
 * in a console.error.
 *
 * Usage:
 *   readonly stats = asyncState(() => this.dashboard.getStats());
 *   ngOnInit() { void this.stats.load(); }
 *
 * `isEmpty` decides when a successful response should read as empty rather than
 * ready — an empty array, a zero count, whatever the screen means by "nothing".
 */
export function asyncState<T>(
  loader: () => Observable<T>,
  options: { isEmpty?: (value: T) => boolean } = {}
): AsyncState<T> {
  const data = signal<T | null>(null);
  const error = signal<AppError | null>(null);
  const busy = signal(false);
  const settled = signal(false);

  const isEmpty = options.isEmpty ?? defaultIsEmpty;

  const state = computed<ViewState>(() => {
    if (error()) return 'error';
    if (!settled()) return 'loading';
    const value = data();
    if (value === null || isEmpty(value)) return 'empty';
    return 'ready';
  });

  async function load(): Promise<void> {
    busy.set(true);
    error.set(null);
    try {
      const value = await firstValue(loader());
      data.set(value);
      settled.set(true);
    } catch (cause) {
      // The error interceptor has already decided how this surfaces globally.
      // We keep it here so the screen can render its inline error state too.
      error.set(isAppError(cause) ? cause : appErrorFromUnknown());
    } finally {
      busy.set(false);
    }
  }

  return {
    state,
    data: data.asReadonly(),
    error: error.asReadonly(),
    busy: busy.asReadonly(),
    load,
    set: (value: T) => {
      data.set(value);
      error.set(null);
      settled.set(true);
    },
  };
}

function defaultIsEmpty(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Resolve the first emission, rejecting if the stream completes without one. */
function firstValue<T>(source: Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let emitted = false;
    const subscription = source.subscribe({
      next: value => {
        emitted = true;
        resolve(value);
        subscription.unsubscribe();
      },
      error: reject,
      complete: () => {
        if (!emitted) reject(new Error('Request completed without a response'));
      },
    });
  });
}
