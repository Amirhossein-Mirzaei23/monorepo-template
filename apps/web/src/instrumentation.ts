/**
 * Next.js instrumentation hook — runs once per server process.
 * Enables OpenTelemetry when OTEL_ENABLED=true (same switch as the API).
 */
export async function register(): Promise<void> {
  if (process.env.OTEL_ENABLED !== 'true') {
    return;
  }
  const [{ NodeSDK }, { getNodeAutoInstrumentations }] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/auto-instrumentations-node'),
  ]);

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'monorepo-web',
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
}
