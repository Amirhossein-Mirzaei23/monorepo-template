import {
  parseApiResponse,
  publicSellerProfileSchema,
  type PublicSellerProfileDto,
} from '@monorepo/shared-types';
import { serverApiUrl } from '@/lib/config';

/**
 * PROF-002 — GET {API}/profiles/sellers/:id for the /s/{id} RSC. Direct origin
 * hop like the marketplace server fetchers (fetchLotDetailServer & co.): the
 * ONLY consumer is the public RSC page, so there is deliberately no BFF route
 * and no client hook — a client fetch would re-fetch data the server already
 * rendered (CONVENTIONS → decision table: never fetch the same data on both
 * sides of one page). Returns null ONLY for the API's 404 (unknown profile id,
 * non-seller, non-ACTIVE user — one uniform 404, no oracle) so the route can
 * notFound(); any other failure throws (transient API outage → the route
 * group's error boundary with retry, never a fake 404). Responses validate
 * against the generated-schema-backed publicSellerProfileSchema (contract
 * drift fails loudly).
 */
export async function fetchSellerServer(id: string): Promise<PublicSellerProfileDto | null> {
  const response = await fetch(`${serverApiUrl}/profiles/sellers/${encodeURIComponent(id)}`, {
    headers: { accept: 'application/json', 'x-request-id': crypto.randomUUID() },
    cache: 'no-store',
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Seller profile request failed (${response.status})`);
  }
  const raw: unknown = await response.json();
  return parseApiResponse(publicSellerProfileSchema, raw, 'seller profile (server)');
}
