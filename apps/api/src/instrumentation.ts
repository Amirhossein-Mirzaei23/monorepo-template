import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';

/**
 * Optional OpenTelemetry tracing. Enabled with OTEL_ENABLED=true; exports to the
 * standard OTLP endpoint (OTEL_EXPORTER_OTLP_ENDPOINT). Imported first in main.ts
 * so instrumentation patches apply before any other module loads.
 */
let sdk: NodeSDK | undefined;

export function initializeTelemetry(): void {
  if (process.env.OTEL_ENABLED !== 'true' || sdk) {
    return;
  }

  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'monorepo-api',
    instrumentations: [
      getNodeAutoInstrumentations({
        // Filesystem spans are noisy for API servers; disable unless debugging.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  process.on('SIGTERM', () => {
    void sdk?.shutdown().catch(() => undefined);
  });
}
