import type {
  ConversationListItemDto,
  MessagePageDto,
  MessageResponseDto,
} from '@monorepo/shared-types';

/**
 * Shared CHT-002 inbox-row fixture for the chat feature tests —
 * `conversationsPageSchema` validates this shape in the fetcher, so keep it
 * contract-exact.
 */
export function conversationItemFixture(
  overrides: Partial<ConversationListItemDto> = {},
): ConversationListItemDto {
  return {
    id: 'conv-1',
    status: 'ACTIVE',
    lastMessageAt: '2026-09-05T09:30:00.000Z',
    lastMessagePreview: 'سلام، موجودی همین رنگ هم دارید؟',
    isLastMessageSystem: false,
    lot: {
      code: '7Kd2Qm9x',
      title: 'عمده پیراهن مردانه — ۵۰ عدد',
      coverThumbUrl: 'http://localhost:3001/media/2026/09/asset-1t.webp',
      unitPrice: 2_250_000,
      status: 'ACTIVE',
    },
    counterpart: {
      id: 'user-2',
      name: 'مینا رضایی',
      avatarUrl: null,
      verified: false,
    },
    myUnreadCount: 0,
    role: 'buyer',
    ...overrides,
  };
}

/** CHT-006 thread fixture — `messagePageSchema` validates this shape in the
 * fetcher, so keep it contract-exact. The current user is `user-1`
 * (the tests' auth mock), the counterpart `user-2`. */
export function messageFixture(overrides: Partial<MessageResponseDto> = {}): MessageResponseDto {
  return {
    id: 'm-1',
    conversationId: 'conv-1',
    senderId: 'user-2',
    type: 'TEXT',
    body: 'سلام، موجود است؟',
    createdAt: '2026-09-05T09:30:00.000Z',
    readAt: null,
    ...overrides,
  };
}

/** The CHT-003 backwards-cursor envelope (items ASC). */
export function messagePageFixture(
  items: MessageResponseDto[],
  hasMore = false,
  nextCursor: string | null = null,
): MessagePageDto {
  return { items, hasMore, nextCursor };
}
