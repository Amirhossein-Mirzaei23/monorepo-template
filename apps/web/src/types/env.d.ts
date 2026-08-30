declare namespace NodeJS {
  interface ProcessEnv {
    /** Public (build-time): base URL of the NestJS API, see src/lib/config.ts. */
    NEXT_PUBLIC_API_URL?: string;
    /** Server-only: API URL for the BFF route handlers. */
    API_URL?: string;
    OTEL_ENABLED?: string;
    OTEL_SERVICE_NAME?: string;
    OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  }
}
