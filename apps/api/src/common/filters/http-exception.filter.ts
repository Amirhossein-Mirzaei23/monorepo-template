import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  /** Machine-readable error code, when the thrown body carried one (e.g. OTP codes). */
  code?: string;
  /** Retry hint in seconds on 429s, mirrored into the `Retry-After` header. */
  retryAfterSeconds?: number;
  requestId: string | undefined;
  timestamp: string;
}

/**
 * Uniform error shape for every failure:
 * `{ statusCode, error, message, code?, retryAfterSeconds?, requestId, timestamp }`
 * — requestId correlates with the x-request-id response header and the
 * structured logs. Structured extras on the exception's response body
 * (`getResponse()` objects like OtpService's `{ code, retryAfterSeconds }`)
 * are passed through instead of dropped, so clients can map errors by code;
 * every 429 additionally carries `code: 'TOO_MANY_REQUESTS'` whether it came
 * from a service send-cap or from the ThrottlerGuard.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const httpException =
      exception instanceof HttpException
        ? exception
        : new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
        `Unhandled exception on ${request.method} ${request.url}`,
      );
    }

    const status = httpException.getStatus();
    const body: ErrorBody = {
      statusCode: status,
      error: httpException.name,
      message: httpException.message,
      requestId: request.id,
      timestamp: new Date().toISOString(),
      ...structuredExtras(httpException),
    };

    // The ThrottlerGuard throws a plain message; give 429s without a code the
    // shared TOO_MANY_REQUESTS contract (retry hint: guard header → body).
    if (status === HttpStatus.TOO_MANY_REQUESTS && body.code === undefined) {
      body.code = 'TOO_MANY_REQUESTS';
      const headerRetry = response.getHeader('Retry-After');
      const seconds = Number(headerRetry);
      if (headerRetry !== undefined && Number.isFinite(seconds)) {
        body.retryAfterSeconds = seconds;
      }
    }

    if (
      typeof body.retryAfterSeconds === 'number' &&
      response.getHeader('Retry-After') === undefined
    ) {
      response.setHeader('Retry-After', String(Math.max(0, Math.ceil(body.retryAfterSeconds))));
    }

    response.status(status).json(body);
  }
}

/**
 * Extra fields a service attached to the exception body (e.g.
 * `{ code: 'LOCKED', retryAfterSeconds: 42 }`) — everything except the
 * standard statusCode/error/message keys, which the filter owns.
 */
function structuredExtras(exception: HttpException): Record<string, unknown> {
  const exceptionResponse = exception.getResponse();
  if (typeof exceptionResponse !== 'object' || exceptionResponse === null) {
    return {};
  }
  const {
    statusCode: _statusCode,
    error: _error,
    message,
    ...extras
  } = exceptionResponse as Record<string, unknown>;
  if (message !== undefined) {
    return { message: message as string | string[], ...extras };
  }
  return extras;
}
