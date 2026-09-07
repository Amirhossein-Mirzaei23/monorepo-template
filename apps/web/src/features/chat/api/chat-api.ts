/**
 * Chat API access — the inbox reads GET /conversations (CHT-002, CHT-005) and
 * the thread reads/writes the messages endpoints (CHT-003, CHT-006), all
 * through the web BFF (`/api/*`) with every payload validated against the
 * generated contract schemas, so drift fails loudly like every other parsed
 * response.
 */
import {
  conversationsPageSchema,
  markConversationReadResponseSchema,
  messagePageSchema,
  messageResponseSchema,
  parseApiResponse,
  type ConversationListItemDto,
  type MarkConversationReadResponseDto,
  type MessagePageDto,
  type MessageResponseDto,
  type Paginated,
} from '@monorepo/shared-types';
import { apiFetch } from '@/lib/api-client';

/** Inbox page size — the API's own default (CHT-002: default 20, hard cap 50). */
export const CONVERSATIONS_PAGE_SIZE = 20;

/** Page size for the conversations page-1 scan that resolves thread context
 * (CHT-006 — there is no GET /conversations/:id; documented follow-up). */
export const CONVERSATIONS_CONTEXT_SCAN_LIMIT = 50;

/** Chat-history page size — the API's own default (CHT-003: default 30, cap 50). */
export const MESSAGES_PAGE_SIZE = 30;

/** Hard cap of a TEXT message body (post-trim characters) — CHT-003 contract. */
export const MESSAGE_BODY_MAX_LENGTH = 2000;

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

/**
 * GET /conversations/:id/messages — backwards-cursor history (CHT-003):
 * `before` omitted → the NEWEST page; otherwise the page of messages strictly
 * older than the cursor. `items` are ASC (oldest → newest within the page);
 * `hasMore`/`nextCursor` point further BACK in time.
 */
export async function fetchMessages(
  token: string | undefined,
  conversationId: string,
  before?: string,
): Promise<MessagePageDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const params = new URLSearchParams({ limit: String(MESSAGES_PAGE_SIZE) });
  if (before !== undefined) {
    params.set('before', before);
  }
  const raw = await apiFetch<unknown>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
    { token },
  );
  return parseApiResponse(messagePageSchema, raw, 'messages');
}

/**
 * The `POST /conversations/:id/messages` body — exactly one of the two API
 * shapes (CHT-003/CHT-007): a trimmed TEXT body, or a media reference whose
 * type matches the uploaded asset (media rows are body-less by contract).
 */
export type SendMessagePayload =
  { body: string } | { type: 'IMAGE' | 'VIDEO'; mediaAssetId: string };

/** POST /conversations/:id/messages — send a TEXT or media message. */
export async function sendMessage(
  token: string | undefined,
  conversationId: string,
  payload: SendMessagePayload,
): Promise<MessageResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: 'POST', token, body: payload },
  );
  return parseApiResponse(messageResponseSchema, raw, 'message');
}

/** POST /conversations/:id/read — mark my side read (CHT-003); answers
 * { readCount } (idempotent — 0 on a re-read). */
export async function markConversationRead(
  token: string | undefined,
  conversationId: string,
): Promise<MarkConversationReadResponseDto> {
  if (!token) {
    throw new Error('Not authenticated');
  }
  const raw = await apiFetch<unknown>(
    `/api/conversations/${encodeURIComponent(conversationId)}/read`,
    { method: 'POST', token },
  );
  return parseApiResponse(markConversationReadResponseSchema, raw, 'read receipt');
}
