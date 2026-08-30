import 'reflect-metadata';

/**
 * Jest runs before .env is loaded, so tests provide safe defaults that satisfy
 * the fail-fast env validation in src/config/env.validation.ts.
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.PORT = process.env.PORT ?? '3001';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://template:template@localhost:5432/template';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-test-access-secret';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-test-refresh-secret';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS ?? 'http://localhost:3000';
