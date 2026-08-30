import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, tap } from 'rxjs';
import type { MetricsService } from '../../metrics/metrics.service';

/**
 * Records http request duration into the Prometheus registry and fails soft:
 * metrics must never break request handling.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<string>() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const stopTimer = this.metrics.startHttpRequestTimer();

    return next.handle().pipe(
      tap({
        next: () => this.observe(stopTimer, request, response),
        error: () => this.observe(stopTimer, request, response),
      }),
    );
  }

  private observe(
    stopTimer: (labels: { method: string; route: string; status: number }) => void,
    request: Request,
    response: Response,
  ): void {
    try {
      stopTimer({
        method: request.method,
        route: request.route?.path ?? 'unmatched',
        status: response.statusCode,
      });
    } catch {
      // never let metrics observability break the request path
    }
  }
}
