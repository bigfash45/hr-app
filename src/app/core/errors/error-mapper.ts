import { HttpErrorResponse } from '@angular/common/http';
import { AppError } from './app-error';

/**
 * HTTP failure -> AppError. This function is the decision table from the
 * implementation plan (§5.3) expressed as code, and it is the only place that
 * decides what a user sees when a request fails.
 *
 * Copy rules:
 *  - Never leak a backend message verbatim for auth failures (PRD §6.1: a login
 *    error must not hint at which field was wrong).
 *  - Never render a stack trace or an internal identifier.
 *  - Always give the user something to do next.
 */

/**
 * Only these methods are safe to offer a blind Retry on. Re-firing a POST could
 * submit a second leave request or upload a payslip twice, which is worse than
 * the error itself. Add specific idempotent POST paths here once the backend
 * confirms them.
 */
export function isRetryableRequest(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'PUT' || m === 'DELETE';
}

/** True when this 401 is a failed login rather than an expired session. */
function isLoginAttempt(url: string): boolean {
  return url.includes('/auth/login');
}

/**
 * Pull field-level validation errors out of the response body. Shapes differ
 * between backends, so we accept the three common ones:
 *   { errors: { email: "..." } }
 *   { errors: [{ field: "email", message: "..." }] }
 *   { fieldErrors: { email: "..." } }
 */
function extractFieldErrors(body: unknown): Record<string, string> | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const raw = body as Record<string, unknown>;
  const source = raw['errors'] ?? raw['fieldErrors'] ?? raw['violations'];

  if (Array.isArray(source)) {
    const out: Record<string, string> = {};
    for (const item of source) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const field = entry['field'] ?? entry['property'] ?? entry['path'];
      const message = entry['message'] ?? entry['error'] ?? entry['defaultMessage'];
      if (typeof field === 'string' && typeof message === 'string') out[field] = message;
    }
    return Object.keys(out).length ? out : undefined;
  }

  if (typeof source === 'object' && source !== null) {
    const out: Record<string, string> = {};
    for (const [field, message] of Object.entries(source)) {
      if (typeof message === 'string') out[field] = message;
      else if (Array.isArray(message) && typeof message[0] === 'string') out[field] = message[0];
    }
    return Object.keys(out).length ? out : undefined;
  }

  return undefined;
}

/**
 * A backend message is safe to show only when it is a short, human sentence.
 * Anything long, or containing markers of internal detail, is replaced by our
 * own copy.
 */
function safeBackendMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const message = (body as Record<string, unknown>)['message'];
  if (typeof message !== 'string') return undefined;

  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 160) return undefined;
  if (/exception|stacktrace|\bat [a-z]+\.[a-z]+\.|SQL|null pointer/i.test(trimmed)) return undefined;
  // Generic Spring fallbacks carry no information for the user.
  if (/^(internal server error|unexpected server error|bad request)$/i.test(trimmed)) return undefined;

  return trimmed;
}

export function mapHttpError(error: HttpErrorResponse, method = 'GET'): AppError {
  const correlationId = error.headers?.get('X-Request-Id') ?? undefined;
  const retryable = isRetryableRequest(method);
  const backendMessage = safeBackendMessage(error.error);

  const base = { correlationId, status: error.status };

  // Status 0 means the request never reached a server: offline, DNS failure,
  // CORS rejection, or the host being down.
  if (error.status === 0) {
    return {
      ...base,
      kind: 'network',
      title: "Can't reach NowNowHR",
      message:
        'Check your internet connection and try again. If your connection is fine, the server may be temporarily unavailable.',
      presentation: 'modal',
      retryable: true,
    };
  }

  switch (error.status) {
    case 400:
      return {
        ...base,
        kind: 'unknown',
        title: 'Something went wrong',
        message:
          backendMessage ??
          'We could not complete that request. Please try again, and contact IT support if it keeps happening.',
        presentation: 'modal',
        retryable: false,
      };

    case 401:
      // Two very different situations behind one status code.
      return isLoginAttempt(error.url ?? '')
        ? {
            ...base,
            kind: 'auth',
            title: 'Sign in failed',
            // Deliberately generic — PRD §6.1 forbids field-level hints, so we
            // never reveal whether the email exists.
            message: 'The details you entered are incorrect.',
            presentation: 'inline',
            retryable: false,
          }
        : {
            ...base,
            kind: 'auth',
            title: 'Your session expired',
            message: 'Sign in again to continue. Your unsaved work on this page is preserved.',
            presentation: 'modal',
            retryable: false,
          };

    case 403:
      return {
        ...base,
        kind: 'forbidden',
        title: "You don't have access to this",
        message:
          'Your role does not permit this action. If you believe this is wrong, contact your HR Manager.',
        presentation: 'modal',
        retryable: false,
      };

    case 404:
      // A missing record is not an emergency — the calling screen shows an
      // empty state rather than throwing a dialog in the user's face.
      return {
        ...base,
        kind: 'notFound',
        title: 'Not found',
        message: backendMessage ?? 'This record no longer exists. It may have been removed.',
        presentation: 'inline',
        retryable: false,
      };

    case 409:
      return {
        ...base,
        kind: 'conflict',
        title: "That doesn't fit",
        message:
          backendMessage ??
          'This conflicts with an existing record. Review your entry and try again.',
        presentation: 'toast',
        retryable: false,
      };

    case 422:
      return {
        ...base,
        kind: 'validation',
        title: 'Check your entries',
        message: backendMessage ?? 'Some fields need attention.',
        presentation: 'inline',
        fieldErrors: extractFieldErrors(error.error),
        retryable: false,
      };

    case 423:
      return {
        ...base,
        kind: 'locked',
        title: 'Account locked',
        // PRD §6.1 — locks after 5 consecutive failures.
        message:
          'Your account has been locked after too many failed sign-in attempts. Contact your HR Manager to unlock it.',
        presentation: 'modal',
        retryable: false,
      };

    case 429:
      return {
        ...base,
        kind: 'rateLimit',
        title: 'Too many requests',
        message: 'You are going a little fast. Wait a moment and try again.',
        presentation: 'toast',
        retryable: true,
      };
  }

  if (error.status >= 500) {
    return {
      ...base,
      kind: 'server',
      title: 'Something went wrong on our side',
      message: correlationId
        ? 'This is not your fault. Try again, and if it persists share the reference below with IT support.'
        : 'This is not your fault. Please try again, and contact IT support if it persists.',
      presentation: 'modal',
      retryable,
    };
  }

  return {
    ...base,
    kind: 'unknown',
    title: 'Something went wrong',
    message: backendMessage ?? 'An unexpected error occurred. Please try again.',
    presentation: 'modal',
    retryable,
  };
}

/** Build an AppError for a non-HTTP failure (an uncaught throw, say). */
export function appErrorFromUnknown(): AppError {
  return {
    kind: 'unknown',
    presentation: 'modal',
    title: 'Something went wrong',
    message:
      'The page hit an unexpected problem. Reload and try again — if it keeps happening, contact IT support.',
    retryable: false,
  };
}
