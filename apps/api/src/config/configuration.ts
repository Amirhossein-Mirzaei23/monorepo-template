import type { ConfigService } from '@nestjs/config';
import { Environment } from './env.validation';

/** Fully typed application config (single `app` namespace). */
export interface AppConfig {
  environment: Environment;
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  throttle: {
    ttlMs: number;
    limit: number;
  };
  otel: {
    serviceName: string;
    endpoint: string | undefined;
  };
  sentryDsn: string | undefined;
  sms: SmsConfig;
}

/** IranPayamak pattern-SMS settings — optional; enforced at send time in SmsService. */
export interface SmsConfig {
  apiKey: string | undefined;
  patternUrl: string;
  lineNumber: string | undefined;
  webPatternCode: string | undefined;
  androidPatternCode: string | undefined;
}

export default (): { app: AppConfig } => ({
  app: {
    environment: (process.env.NODE_ENV as Environment | undefined) ?? Environment.Development,
    port: toInt(process.env.PORT, 3001),
    databaseUrl: process.env.DATABASE_URL ?? '',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
      accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
    },
    throttle: {
      ttlMs: toInt(process.env.THROTTLE_TTL_MS, 60_000),
      limit: toInt(process.env.THROTTLE_LIMIT, 100),
    },
    otel: {
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'monorepo-api',
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
    sentryDsn: process.env.SENTRY_DSN || undefined,
    sms: {
      apiKey: process.env.SMS_API_KEY || undefined,
      patternUrl: process.env.SMS_PATTERN_URL ?? 'https://api.iranpayamak.com/ws/v1/sms/pattern',
      lineNumber: process.env.SMS_LINE_NUMBER || undefined,
      webPatternCode: process.env.SMS_PATTERN_CODE_WEB || undefined,
      androidPatternCode: process.env.SMS_PATTERN_CODE_ANDROID || undefined,
    },
  },
});

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Typed accessor — avoids `config.get<T>('app')!` non-null assertions across the codebase.
 */
export function requireAppConfig(configService: ConfigService): AppConfig {
  const config = configService.get<AppConfig>('app');
  if (!config) {
    throw new Error('App config namespace "app" is not loaded — check ConfigModule.forRoot');
  }
  return config;
}
