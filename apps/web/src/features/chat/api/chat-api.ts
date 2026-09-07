/**
 * Chat API access (CHT-005) — the inbox reads GET /conversations through the
 * web BFF (`/api/conversations`) and validates every page against the CHT-002
 * contract (`conversationsPageSchema`), so drift fails loudly like every other
 * parsed response. Sends/reads (CHT-006) join this module on their card.
 */
import {
  conversationsPageSchema,
  parseApiResponse,
  type ConversationListItemDto,
  type Paginated,
} from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';

/** Inbox page size — the API's own default (CHT-002: default 20, hard cap 50). */
export const CONVERSATIONS_PAGE_SIZE = 20;

export interface ConversationsQuery {
  page?: number;
  limit?: number;
}

/** GET /conversations — the caller's threads, newest activity first (CHT-002). */
export async function fetchConversations(
  token: string | undefined,
  query: ConversationsQuery = {},
): Promise<Paginated<ConversationListItemDto>> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const params = new URLSearchParams();
  if (query.page !== undefined) {
    params.set('page', String(query.page));
  }
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }
  const search = params.toString();
  const raw = await apiFetch<unknown>(`/api/conversations${search ? `?${search}` : ''}`, { token });
  return parseApiResponse(conversationsPageSchema, raw, 'conversations');
}
