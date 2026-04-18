/**
 * The single error shape the UI is allowed to see.
 *
 * Nothing in features/ should ever touch an HttpErrorResponse — the error
 * interceptor converts every failure into an AppError first. That keeps the
 * "what do we show the user" decision in one place (see error-mapper.ts and
 * FeedbackService) instead of scattered across every subscribe().
 */
export type ErrorKind =
  | 'network' // no connection / server unreachable
  | 'auth' // 401 — bad credentials, or an expired session
  | 'forbidden' // 403 — role or company scope denies this
  | 'notFound' // 404 — the record is gone
  | 'conflict' // 409 — duplicate email, overlapping leave, double clock-in
  | 'validation' // 422 — server-side field validation
  | 'locked' // 423 — account locked after failed logins (PRD §6.1)
  | 'rateLimit' // 429
  | 'server' // 5xx
  | 'unknown';

/** How this error should be surfaced. Decided once, in error-mapper. */
export type ErrorPresentation =
  /** Blocking dialog — the user must read and acknowledge it. */
  | 'modal'
  /** Non-blocking toast — informative, dismissible. */
  | 'toast'
  /** Nothing global; the calling component renders it inline (form field, empty state). */
  | 'inline';

export interface AppError {
  kind: ErrorKind;
  /** Dialog heading. Short, no punctuation at the end. */
  title: string;
  /** Human, actionable, and free of stack traces or backend internals. */
  message: string;
  /** How to surface it. */
  presentation: ErrorPresentation;
  /** Populated on 422 so a reactive form can map errors onto its controls. */
  fieldErrors?: Record<string, string>;
  /** X-Request-Id, so a user-reported error can be traced to a server log. */
  correlationId?: string;
  /** Whether offering a Retry affordance is safe. See isRetryableRequest(). */
  retryable: boolean;
  /** Original HTTP status, for logging only. Never render this. */
  status?: number;
}

/** Narrow an unknown caught value to an AppError. */
export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'presentation' in value &&
    'message' in value
  );
}
