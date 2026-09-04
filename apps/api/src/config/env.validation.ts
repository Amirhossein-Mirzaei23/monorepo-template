import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Fail-fast environment validation: the API refuses to boot when required
 * variables are missing or malformed (doc/ARCHITECTURE.md → Environments & Config).
 */
export class EnvironmentVariables {
  @IsOptional()
  @IsEnum(Environment)
  NODE_ENV = Environment.Development;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  @IsString()
  @Matches(/^postgresql:\/\//, { message: 'DATABASE_URL must be a postgresql:// URL' })
  DATABASE_URL!: string;

  @IsString()
  @MinLength(16, { message: 'JWT_ACCESS_SECRET must be at least 16 characters' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(16, { message: 'JWT_REFRESH_SECRET must be at least 16 characters' })
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_TTL = '15m';

  @IsOptional()
  @IsString()
  JWT_REFRESH_TTL = '30d';

  @IsOptional()
  @IsString()
  CORS_ORIGINS = 'http://localhost:3000';

  @IsOptional()
  @IsInt()
  @Min(1000)
  THROTTLE_TTL_MS: number = 60000;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 100;

  @IsOptional()
  @IsString()
  OTEL_SERVICE_NAME = 'monorepo-api';

  @IsOptional()
  @IsString()
  OTEL_EXPORTER_OTLP_ENDPOINT: string | undefined;

  @IsOptional()
  @IsString()
  SENTRY_DSN: string | undefined;

  // SMS delivery (IranPayamak patterns) — optional, enforced at send time.
  @IsOptional()
  @IsString()
  SMS_API_KEY: string | undefined;

  @IsOptional()
  @IsString()
  SMS_PATTERN_URL = 'https://api.iranpayamak.com/ws/v1/sms/pattern';

  @IsOptional()
  @IsString()
  SMS_LINE_NUMBER: string | undefined;

  @IsOptional()
  @IsString()
  SMS_PATTERN_CODE_WEB: string | undefined;

  @IsOptional()
  @IsString()
  SMS_PATTERN_CODE_ANDROID: string | undefined;

  // OTP login codes (AUTH-002) — strictly "true"/"false": class-transformer's implicit
  // Boolean coercion would silently turn any other string into `true`, so the raw value
  // is validated as a string union and converted where consumed.
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'OTP_DEV_MODE must be "true" or "false"' })
  OTP_DEV_MODE: 'true' | 'false' = 'false';

  @IsOptional()
  @IsInt()
  @Min(1000)
  OTP_TTL_MS: number = 120000; // 2 minutes (plan §R10)

  @IsOptional()
  @IsInt()
  @Min(1)
  OTP_MAX_ATTEMPTS: number = 5;

  @IsOptional()
  @IsInt()
  @Min(1)
  OTP_SEND_HOURLY: number = 3;

  @IsOptional()
  @IsInt()
  @Min(1)
  OTP_SEND_DAILY: number = 5;

  // Media storage (MEDIA-001) — local-disk driver root + public serving base URL.
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'STORAGE_DIR must not be empty' })
  STORAGE_DIR: string = './storage';

  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\/\S+$/, { message: 'PUBLIC_MEDIA_BASE_URL must be an http(s) URL' })
  PUBLIC_MEDIA_BASE_URL: string = 'http://localhost:3001/media';

  // Upload limits (MEDIA-002/003) — image ≤ 10 MB × 15/lot; video ≤ 50 MB × 60 s × 3/lot.
  @IsOptional()
  @IsInt()
  @Min(1)
  MAX_IMAGE_MB: number = 10;

  @IsOptional()
  @IsInt()
  @Min(1)
  MAX_VIDEO_MB: number = 50;

  @IsOptional()
  @IsInt()
  @Min(1)
  MAX_LOT_IMAGES: number = 15;

  @IsOptional()
  @IsInt()
  @Min(1)
  MAX_LOT_VIDEOS: number = 3;

  @IsOptional()
  @IsInt()
  @Min(1)
  MAX_VIDEO_SECONDS: number = 60;

  // WebSocket gateway (CHT-004) — comma-separated handshake origin allowlist.
  @IsOptional()
  @IsString()
  WS_ORIGINS: string = 'http://localhost:3000';
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${details}`);
  }

  // Fail-fast safety rule: dev-mode OTP codes must never reach a production boot.
  if (validated.NODE_ENV === Environment.Production && validated.OTP_DEV_MODE === 'true') {
    throw new Error(
      'Environment validation failed:\n  - OTP_DEV_MODE: must be "false" when NODE_ENV=production',
    );
  }

  return validated;
}
