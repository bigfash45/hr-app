import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Stamps every request with a unique X-Request-Id.
 *
 * The point is traceability: when a user reports "it said something went wrong",
 * the error dialog shows this id and support can find the exact server-side log
 * line. Without it, a 500 is unactionable.
 *
 * Runs first in the chain so the id is present on retries and on anything the
 * later interceptors log.
 */
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ setHeaders: { 'X-Request-Id': requestId() } }));

function requestId(): string {
  // crypto.randomUUID needs a secure context; http://<ip> in dev is not one.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
