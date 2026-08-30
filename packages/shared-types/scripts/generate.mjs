#!/usr/bin/env node
/**
 * Contract codegen for @monorepo/shared-types.
 *
 * 1. openapi-typescript → src/generated/schema.d.ts (type-level contract)
 * 2. gen-zod            → src/generated/schema.zod.ts (runtime validation)
 *
 * Input: ./openapi.json (written by `npm run gen:openapi` in @monorepo/api —
 * run `npm run gen:types` at the repo root to do both in order).
 * The generated files are committed; CI fails the build if they are stale.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const specPath = join(packageRoot, 'openapi.json');
const generatedDir = join(packageRoot, 'src', 'generated');
const typesOut = join(generatedDir, 'schema.d.ts');
const zodOut = join(generatedDir, 'schema.zod.ts');

mkdirSync(generatedDir, { recursive: true });
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

// --- 1) TypeScript types via openapi-typescript ---
execFileSync('openapi-typescript', [specPath, '--output', typesOut], { stdio: 'inherit' });

// --- 2) zod schemas from the same document ---
const schemas = spec.components?.schemas ?? {};
const entries = Object.entries(schemas);
if (entries.length === 0) {
  throw new Error('openapi.json has no components.schemas — did the API dump run?');
}

const lowerFirst = (value) => value.charAt(0).toLowerCase() + value.slice(1);
const constName = (schemaName) => `${lowerFirst(schemaName)}Schema`;
const q = (value) => `'${String(value).replaceAll("'", "\\'")}'`;

function propertyToZod(prop, depth) {
  const pad = '  '.repeat(depth);
  if (prop.$ref) {
    const name = prop.$ref.replace('#/components/schemas/', '');
    return constName(name);
  }
  if (prop.anyOf || prop.oneOf) {
    const variants = (prop.anyOf ?? prop.oneOf).map((variant) => propertyToZod(variant, depth));
    return `z.union([${variants.join(', ')}])`;
  }
  let inner;
  switch (prop.type) {
    case 'string':
      if (Array.isArray(prop.enum)) {
        inner = `z.enum([${prop.enum.map(q).join(', ')}])`;
      } else if (prop.format === 'date-time') {
        inner = 'z.iso.datetime()';
      } else if (prop.format === 'email') {
        inner = 'z.email()';
      } else if (prop.format === 'uuid') {
        inner = 'z.uuid()';
      } else {
        inner = 'z.string()';
      }
      break;
    case 'integer':
      inner = 'z.number().int()';
      break;
    case 'number':
      inner = 'z.number()';
      break;
    case 'boolean':
      inner = 'z.boolean()';
      break;
    case 'array':
      inner = `z.array(${propertyToZod(prop.items ?? { type: 'string' }, depth)})`;
      break;
    case 'object':
    default: {
      const nested = objectToZod(prop, depth + 1);
      inner = `${pad}${nested}`;
      break;
    }
  }
  return prop.nullable === true ? `${inner}.nullable()` : inner;
}

function objectToZod(schema, depth) {
  const pad = '  '.repeat(depth);
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const fields = Object.entries(properties).map(([name, prop]) => {
    const expression = propertyToZod(prop, depth + 1);
    const optional = required.has(name) ? '' : '.optional()';
    return `${pad}  ${/^[A-Za-z_$][\w$]*$/.test(name) ? name : q(name)}: ${expression}${optional},`;
  });
  return `z.object({\n${fields.join('\n')}\n${pad}})`;
}

const blocks = entries.map(([name, schema]) => {
  if (Array.isArray(schema.enum)) {
    return `export const ${constName(name)} = z.enum([${schema.enum.map(q).join(', ')}]);`;
  }
  const objectSchema =
    schema.type === 'object' || schema.properties ? schema : { type: 'object', properties: {} };
  return `export const ${constName(name)} = ${objectToZod(objectSchema, 0)};`;
});

const registry = `export const apiSchemas = {\n${entries
  .map(([name]) => `  ${/^[A-Za-z_$][\w$]*$/.test(name) ? name : q(name)}: ${constName(name)},`)
  .join('\n')}\n} as const;\n`;

const banner =
  '// GENERATED from openapi.json by scripts/generate.mjs — DO NOT EDIT.\n' +
  '// Regenerate with `npm run gen:types` at the repo root.\n' +
  '/* eslint-disable */\n';

writeFileSync(
  zodOut,
  `${banner}\nimport { z } from 'zod';\n\n${blocks.join('\n\n')}\n\n${registry}`,
);
console.info(`Wrote ${zodOut} (${entries.length} schemas)`);
