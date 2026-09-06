/**
 * Categories API access — every call goes through the web BFF
 * (`/api/categories`). Responses are validated with the generated zod schema
 * from `@monorepo/shared-types` (contract drift fails loudly) — no duplicate
 * schema lives here.
 */
import {
  categoryTreeNodeSchema,
  parseApiResponse,
  type CategoryTreeNodeDto,
} from '@monorepo/shared-types';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-client';

/** Public category tree (two levels, active only, ordered). */
export async function categoriesRequest(): Promise<CategoryTreeNodeDto[]> {
  const raw = await apiFetch<unknown>('/api/categories');
  return parseApiResponse(z.array(categoryTreeNodeSchema), raw, 'categories');
}
