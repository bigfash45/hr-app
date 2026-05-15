import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../loading.service';
import { SKIP_LOADING } from '../http-context';

/**
 * Feeds the global progress indicator.
 *
 * finalize() rather than a tap on success: the counter must come back down when
 * a request errors or is cancelled, or the bar sticks on screen forever.
 */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_LOADING)) return next(req);

  const loading = inject(LoadingService);
  loading.start();
  return next(req).pipe(finalize(() => loading.stop()));
};
