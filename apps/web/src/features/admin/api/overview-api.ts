import { parseApiResponse } from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';
import { adminOverviewSchema, type AdminOverviewData } from '../schemas/overview-schema';

/**
 * Admin overview through the BFF (`/api/admin/overview`). Responses are
 * validated against the generated schema — contract drift fails loudly.
 */
export async function adminOverviewRequest(token: string | undefined): Promise<AdminOverviewData> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>('/api/admin/overview', { token });
  return parseApiResponse(adminOverviewSchema, raw, 'admin overview');
}
