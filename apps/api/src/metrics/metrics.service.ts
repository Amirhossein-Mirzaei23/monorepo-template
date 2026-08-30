import { Injectable, type OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Histogram, Registry } from 'prom-client';

/** Prometheus registry for the API. Exposed at GET /metrics. */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  private readonly httpRequestDuration: Histogram<string>;

  constructor() {
    this.registry.setDefaultLabels({ app: 'monorepo-api' });

    this.httpRequestDuration = new Histogram({
      name: 'api_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'] as const,
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry, prefix: 'api_' });
  }

  startHttpRequestTimer(): (labels: { method: string; route: string; status: number }) => void {
    return this.httpRequestDuration.startTimer();
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
