/**
 * Env defaults so tooling scripts (swagger dump) can boot without a real
 * environment. Import this module FIRST — before anything that reads env.
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://template:template@localhost:5432/template';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'codegen-access-secret-codegen-access';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'codegen-refresh-secret-codegen-refresh';
