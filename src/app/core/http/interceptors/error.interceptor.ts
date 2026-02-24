import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { FeedbackService } from '../../feedback/feedback.service';
import { mapHttpError } from '../../errors/error-mapper';
import { SKIP_ERROR } from '../http-context';

/**
 * Last interceptor in the chain: turns every HttpErrorResponse into an AppError,
 * surfaces it according to the §5.3 decision table, and rethrows the AppError so
 * the caller still gets a chance to react.
 *
 * Two consequences worth knowing:
 *  - features catch AppError, never HttpErrorResponse
 *  - validation (422), not-found (404), and login 401s are mapped but NOT shown
 *    globally, because they belong on the form or in an empty state. The mapper
 *    marks those `presentation: 'inline'` and FeedbackService stays quiet.
 *
 * The Retry button re-fires the original request, and only for methods where
 * that is safe — see isRetryableRequest.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_ERROR)) {
    // Still normalise the shape so callers only ever handle AppError.
    return next(req).pipe(
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof HttpErrorResponse ? mapHttpError(error, req.method) : error
        )
      )
    );
  }

  const feedback = inject(FeedbackService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) return throwError(() => error);

      const appError = mapHttpError(error, req.method);
      feedback.show(appError);
      return throwError(() => appError);
    })
  );
};
