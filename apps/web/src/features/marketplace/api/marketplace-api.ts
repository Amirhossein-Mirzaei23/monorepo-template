/**
 * Marketplace browse API access (MKT-006) — the public listing GET /lots and
 * the public category tree, in two transports:
 *
 * - `fetchLots` → the web BFF (`/api/lots?…`) for CLIENT pages (the hook),
 *   like every feature fetcher (frontend-data.md → Transport routing).
 * - `fetchLotsServer` / `fetchCategoriesServer` → direct server-to-server hop
 *   to the API origin for the RSC pages (`/lots`, `/c/{slug}`), which cannot
 *   resolve a relative BFF URL and must not self-fetch over HTTP. They mirror
 *   `proxyToApi`'s public-endpoint semantics (accept JSON, request-id,
 *   no-store) without auth/cookie forwarding — these endpoints are @Public.
 *
 * Responses on BOTH paths validate through the same generated-schema-backed
 * `lotCardPageSchema` (contract drift fails loudly). File imported by client
 * components and RSCs alike; the server fns are pure fetch (no node builtins),
 * so bundling them is harmless.
 */
import {
  categoryTreeNodeSchema,
  parseApiResponse,
  type CategoryTreeNodeDto,
  type LotCardResponseDto,
  type Paginated,
} from '@monorepo/shared-types';
import { z } from 'zod';
import { apiFetch } from '@/lib/api-client';
import { serverApiUrl } from '@/lib/config';
import {
  lotsBrowseQueryString,
  lotCardPageSchema,
  type LotsBrowseQuery,
} from '../schemas/browse-query';

/**
 * GET /lots — one public page of lot cards through the BFF. Query is always
 * fully serialized by `lotsBrowseQueryString` (same param names as the API).
 */
export async function fetchLots(query: LotsBrowseQuery): Promise<Paginated<LotCardResponseDto>> {
  const search = lotsBrowseQueryString(query);
  const raw = await apiFetch<unknown>(`/api/lots${search ? `?${search}` : ''}`);
  return parseApiResponse(lotCardPageSchema, raw, 'lots');
}

/**
 * GET {API}/lots — SSR first page for the browse/category pages. Direct
 * origin hop (see module doc); the caller degrades to the client fetch path
 * on failure so a transient API outage still renders the page shell.
 */
export async function fetchLotsServer(
  query: LotsBrowseQuery,
): Promise<Paginated<LotCardResponseDto>> {
  const search = lotsBrowseQueryString(query);
  const response = await fetch(`${serverApiUrl}/lots${search ? `?${search}` : ''}`, {
    headers: { accept: 'application/json', 'x-request-id': crypto.randomUUID() },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Lots request failed (${response.status})`);
  }
  const raw: unknown = await response.json();
  return parseApiResponse(lotCardPageSchema, raw, 'lots (server)');
}

/** GET {API}/categories — public tree for the /c/{slug} landing (slug → id). */
export async function fetchCategoriesServer(): Promise<CategoryTreeNodeDto[]> {
  const response = await fetch(`${serverApiUrl}/categories`, {
    headers: { accept: 'application/json', 'x-request-id': crypto.randomUUID() },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Categories request failed (${response.status})`);
  }
  const raw: unknown = await response.json();
  return parseApiResponse(z.array(categoryTreeNodeSchema), raw, 'categories (server)');
}

/**
 * Depth-first slug lookup over the category tree (two levels today) — powers
 * the /c/{slug} landing pages; an unknown slug → notFound() at the route.
 */
export function findCategoryBySlug(
  tree: CategoryTreeNodeDto[],
  slug: string,
): CategoryTreeNodeDto | undefined {
  for (const node of tree) {
    if (node.slug === slug) {
      return node;
    }
    const child = findCategoryBySlug(node.children, slug);
    if (child) {
      return child;
    }
  }
  return undefined;
}
