import { Injectable, computed, signal } from '@angular/core';

/**
 * Counts in-flight requests so the shell can show a top progress bar.
 *
 * A counter rather than a boolean: with a boolean, two overlapping requests
 * finishing at different times would hide the indicator while one is still
 * running.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly inFlight = signal(0);

  readonly isLoading = computed(() => this.inFlight() > 0);

  start(): void {
    this.inFlight.update(n => n + 1);
  }

  stop(): void {
    this.inFlight.update(n => Math.max(0, n - 1));
  }
}
