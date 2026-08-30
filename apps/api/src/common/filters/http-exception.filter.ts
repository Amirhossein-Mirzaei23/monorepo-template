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
  requestId: string | undefined;
  timestamp: string;
}

/**
 * Uniform error shape for every failure:
 * `{ statusCode, error, message, requestId, timestamp }` — requestId correlates
 * with the x-request-id response header and the structured logs.
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
    };

    response.status(status).json(body);
  }
}
