import './env-defaults';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { buildOpenApiDocument } from '../swagger';

/**
 * Dumps the OpenAPI document consumed by `packages/shared-types` codegen
 * (`npm run gen:types`). The swagger schema is the contract source of truth.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = buildOpenApiDocument(app);
  await app.close();

  const outPath = resolve(__dirname, '../../../../packages/shared-types/openapi.json');
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
  console.info(`OpenAPI document written to ${outPath}`);
}

void main();
