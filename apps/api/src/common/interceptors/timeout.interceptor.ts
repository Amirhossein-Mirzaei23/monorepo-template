import {
  type CallHandler,
  type ExecutionContext,
  GatewayTimeoutException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { type Observable, TimeoutError, catchError, throwError, timeout } from 'rxjs';

const DEFAULT_TIMEOUT_MS = 10_000;

/** Aborts handlers that exceed the timeout budget (default 10s) with a 504. */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<string>() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<Request>();
    const override = Number.parseInt(String(request.headers['x-timeout-ms'] ?? ''), 10);
    const timeoutMs = Number.isNaN(override) ? DEFAULT_TIMEOUT_MS : override;

    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((error: unknown) =>
        error instanceof TimeoutError
          ? throwError(() => new GatewayTimeoutException('Request timed out'))
          : throwError(() => error),
      ),
    );
  }
}
