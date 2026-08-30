import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
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
  return validated;
}
