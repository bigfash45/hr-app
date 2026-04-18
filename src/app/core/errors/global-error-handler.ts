import { ErrorHandler, Injectable, inject, isDevMode } from '@angular/core';
import { FeedbackService } from '../feedback/feedback.service';
import { appErrorFromUnknown } from './error-mapper';
import { isAppError } from './app-error';

/**
 * Catches what the HTTP layer cannot: a throw in a template expression, a
 * lifecycle hook, or an event handler.
 *
 * Without this, such a failure logs to the console and leaves the user staring
 * at a half-rendered screen with no idea anything went wrong. PRD §15.4 requires
 * an error state, and "silent" is not one.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private feedback = inject(FeedbackService);

  handleError(error: unknown): void {
    // AppErrors have already been surfaced by the error interceptor; showing them
    // again here would double up the dialog on every failed request.
    if (isAppError(error)) return;

    if (isDevMode()) {
      // Keep the real stack in front of the developer. In production the details
      // go nowhere useful, and we never want them in front of a user.
      console.error('[NowNowHR] Uncaught error:', error);
    }

    this.feedback.show(appErrorFromUnknown());
  }
}
