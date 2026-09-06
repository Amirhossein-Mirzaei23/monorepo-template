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
  otp: OtpConfig;
  storage: StorageConfig;
  uploads: UploadsConfig;
  ws: WsConfig;
}

/** IranPayamak pattern-SMS settings — optional; enforced at send time in SmsService. */
export interface SmsConfig {
  apiKey: string | undefined;
  patternUrl: string;
  lineNumber: string | undefined;
  webPatternCode: string | undefined;
  androidPatternCode: string | undefined;
}

/** OTP login-code policy (AUTH-002) — TTL, attempt lockout, per-phone send caps. */
export interface OtpConfig {
  devMode: boolean;
  ttlMs: number;
  maxAttempts: number;
  sendHourly: number;
  sendDaily: number;
}

/** Local-disk media storage (MEDIA-001). */
export interface StorageConfig {
  dir: string;
  publicMediaBaseUrl: string;
}

/** Upload limits (MEDIA-002/003) — plan §Media: 10 MB × 15 imgs, 50 MB × 60 s × 3 videos. */
export interface UploadsConfig {
  maxImageMb: number;
  maxVideoMb: number;
  maxLotImages: number;
  maxLotVideos: number;
  maxVideoSeconds: number;
  /** MEDIA-002 per-user daily image-upload quota (MediaAsset rows today, UTC). */
  dailyImageUploads: number;
}

/** WebSocket gateway handshake origins (CHT-004). */
export interface WsConfig {
  origins: string[];
}

export default (): { app: AppConfig } => ({
  app: {
    environment: (process.env.NODE_ENV as Environment | undefined) ?? Environment.Development,
    port: toInt(process.env.PORT, 3001),
    databaseUrl: process.env.DATABASE_URL ?? '',
    corsOrigins: toOriginList(process.env.CORS_ORIGINS, 'http://localhost:3000'),
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
    otp: {
      devMode: process.env.OTP_DEV_MODE === 'true',
      ttlMs: toInt(process.env.OTP_TTL_MS, 120_000),
      maxAttempts: toInt(process.env.OTP_MAX_ATTEMPTS, 5),
      sendHourly: toInt(process.env.OTP_SEND_HOURLY, 3),
      sendDaily: toInt(process.env.OTP_SEND_DAILY, 5),
    },
    storage: {
      dir: process.env.STORAGE_DIR ?? './storage',
      publicMediaBaseUrl: process.env.PUBLIC_MEDIA_BASE_URL ?? 'http://localhost:3001/media',
    },
    uploads: {
      maxImageMb: toInt(process.env.MAX_IMAGE_MB, 10),
      maxVideoMb: toInt(process.env.MAX_VIDEO_MB, 50),
      maxLotImages: toInt(process.env.MAX_LOT_IMAGES, 15),
      maxLotVideos: toInt(process.env.MAX_LOT_VIDEOS, 3),
      maxVideoSeconds: toInt(process.env.MAX_VIDEO_SECONDS, 60),
      dailyImageUploads: toInt(process.env.MAX_IMAGE_UPLOADS_PER_DAY, 200),
    },
    ws: {
      origins: toOriginList(process.env.WS_ORIGINS, 'http://localhost:3000'),
    },
  },
});

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toOriginList(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
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
