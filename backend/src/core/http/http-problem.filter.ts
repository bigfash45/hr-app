import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { currentTenant } from '../tenant/tenant-context';

/**
 * The single error envelope for the API.
 *
 * Shaped to match what the Angular client's error-mapper already parses:
 *
 *   { statusCode, error, message, fieldErrors?, requestId, timestamp, path }
 *
 * `fieldErrors` is the contract the client needs to map 422s onto form controls.
 * Without it the frontend can only show a generic banner, which is why the
 * existing backend's `{timestamp,status,error,message,path}` envelope was not
 * enough (plan decision D4).
 *
 * Nothing internal is ever returned to the caller: no stack traces, no SQL, no
 * constraint names. The requestId is how support ties a user's report to the log.
 */
@Catch()
export class HttpProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = currentTenant()?.requestId ?? response.getHeader('X-Request-Id');

    const problem = this.toProblem(exception);

    if (problem.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${problem.statusCode} [${String(requestId)}]`,
        exception instanceof Error ? exception.stack : String(exception)
      );
    }

    response.status(problem.statusCode).json({
      ...problem,
      requestId: requestId ?? null,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private toProblem(exception: unknown): {
    statusCode: number;
    error: string;
    message: string;
    fieldErrors?: Record<string, string>;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // class-validator failures arrive as { message: string[] }. Turn them into
      // the field map the client can drop onto its reactive form.
      if (typeof body === 'object' && body !== null && Array.isArray((body as any).message)) {
        return {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Validation failed',
          message: 'Some fields need attention.',
          fieldErrors: toFieldErrors((body as any).message as string[]),
        };
      }

      const message =
        typeof body === 'string'
          ? body
          : ((body as any)?.message ?? exception.message ?? 'Request failed');

      return {
        statusCode: status,
        error: HttpStatus[status] ?? 'Error',
        message: Array.isArray(message) ? message.join(' ') : String(message),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 unique constraint -> 409, which the client renders inline rather
      // than as a modal.
      if (exception.code === 'P2002') {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ');
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: target
            ? `A record with this ${humanise(target)} already exists.`
            : 'This conflicts with an existing record.',
        };
      }
      if (exception.code === 'P2025') {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not found',
          message: 'This record no longer exists.',
        };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Something went wrong on our side. Please try again.',
    };
  }
}

/**
 * class-validator emits "email must be an email". Recover the property name so
 * the client can attach the message to the right control.
 */
function toFieldErrors(messages: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const message of messages) {
    const field = message.split(' ')[0];
    if (field && !out[field]) out[field] = message;
  }
  return out;
}

function humanise(target: string): string {
  return target.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}
