import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ConversationStatus, MessageType } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ConversationLotSummaryDto } from './conversation-response.dto';
import type { ConversationListRepositoryRow } from '../conversations.repository';

/**
 * CHT-002 — the inbox contract of `GET /conversations`. Strict allowlist
 * shape per item: thread identity/state + the newest-activity block + the
 * lot context (same block as the CHT-001 creation response) + the
 * counterpart + MY unread count + MY role in the thread. Deliberately NOT in
 * the payload (allowlist + unit/e2e tests pin the key set):
 * - `buyerId`/`sellerId` — raw participant ids are internal; the client gets
 *   the resolved counterpart + its own role instead (no id inference web-side).
 * - the counterpart's full profile (bio/city/…) — the inbox renders name +
 *   trust placeholders only; the full profile page is PROF-002.
 * - `buyerUnreadCount`/`sellerUnreadCount` — only the CALLER's side is ever
 *   exposed (`myUnreadCount`); the counterpart's counter is private.
 */

/** Read-side limits of the conversations inbox (CHT-002): a chat inbox is a
 * recent-activity feed, never a directory — default 20, hard cap 50 (the
 * shared list cap of 100 tightened for this endpoint). */
export const CONVERSATIONS_DEFAULT_LIMIT = 20;
export const CONVERSATIONS_MAX_LIMIT = 50;

/**
 * Query params for GET /conversations — the shared pagination contract with
 * the limit capped at 50. The inherited `sort` param is intentionally NOT
 * honoured here: the inbox is ALWAYS newest-activity first (lastMessageAt
 * desc, id desc tiebreak for stable pages) — a fixed order the card mandates.
 */
export class ConversationListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    default: CONVERSATIONS_DEFAULT_LIMIT,
    minimum: 1,
    maximum: CONVERSATIONS_MAX_LIMIT,
    description: `Page size — capped at ${CONVERSATIONS_MAX_LIMIT} for the chat inbox`,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CONVERSATIONS_MAX_LIMIT)
  override limit = CONVERSATIONS_DEFAULT_LIMIT;
}

/** Which side of the thread the caller is — drives unread + counterpart. */
export type ConversationRole = 'buyer' | 'seller';

/**
 * The other participant, as the inbox renders them. TRS-001 / MEDIA
 * PLACEHOLDERS (documented follow-ups, same discipline as the MKT-004
 * public-seller strip): avatars do not exist yet (`avatarUrl` is a hard null
 * the UI already renders around) and seller verification arrives with
 * TRS-001, so `verified` is a hard-coded false — the badge stays hidden until
 * a real read exists.
 */
export class ConversationCounterpartDto {
  @ApiProperty({ example: 'clx…cuid', description: 'Counterpart user id' })
  id!: string;

  @ApiProperty({ example: 'مینا رضایی', description: 'Account display name' })
  name!: string;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    type: String,
    description: 'Placeholder — always null until user avatars exist (MEDIA/TRS follow-up)',
  })
  avatarUrl!: string | null;

  @ApiProperty({
    example: false,
    description: 'TRS-001 placeholder — verification does not exist until Phase 7; hard false',
  })
  verified!: boolean;
}

/** One inbox row (CHT-002). */
export class ConversationListItemDto {
  @ApiProperty({ example: 'clx…cuid', description: 'Conversation id — thread route param' })
  id!: string;

  @ApiProperty({ enum: ConversationStatus, example: 'ACTIVE' })
  status!: ConversationStatus;

  @ApiProperty({
    example: '2026-09-05T00:00:00.000Z',
    description: 'Newest-message stamp — the inbox sort key',
  })
  lastMessageAt!: Date;

  @ApiPropertyOptional({
    example: 'گفتگو درباره: عمده پیراهن مردانه — ۲٬۲۵۰٬۰۰۰ تومان',
    nullable: true,
    type: String,
    description: 'Truncated (≤ 80 chars) preview of the newest message body',
  })
  lastMessagePreview!: string | null;

  @ApiProperty({
    example: true,
    description:
      'True when the newest message (the one this preview belongs to) is a SYSTEM row — the UI renders the preview in the gray system style. Derived from the latest message relation, not stored',
  })
  isLastMessageSystem!: boolean;

  @ApiProperty({ type: ConversationLotSummaryDto })
  lot!: ConversationLotSummaryDto;

  @ApiProperty({ type: ConversationCounterpartDto })
  counterpart!: ConversationCounterpartDto;

  @ApiProperty({
    example: 3,
    description: "The CALLER's unread count (buyerUnreadCount or sellerUnreadCount by role)",
  })
  myUnreadCount!: number;

  @ApiProperty({
    enum: ['buyer', 'seller'],
    description: "The caller's side of this thread — mirrors which dashboard surfaces it",
  })
  role!: ConversationRole;
}

/**
 * Allowlist mapper — copies ONLY the fields above. The conversation row is
 * joined with its lot (cover link), BOTH participant summaries and the latest
 * message (one query set — batched relations, no N+1), so the whole payload
 * maps from the single page read. `role` / `myUnreadCount` / the counterpart
 * are resolved against `viewerId` at this boundary; `mediaBaseUrl` is
 * resolved by the caller (service boundary) so the mapper stays pure.
 */
export function toConversationListItemDto(
  row: ConversationListRepositoryRow,
  viewerId: string,
  mediaBaseUrl: string,
): ConversationListItemDto {
  const isBuyer = row.buyerId === viewerId;
  const counterpart = isBuyer ? row.seller : row.buyer;
  const lastMessage = row.messages[0];
  const base = mediaBaseUrl.replace(/\/+$/, '');
  const cover = row.lot.media.find((link) => link.isCover);
  return {
    id: row.id,
    status: row.status,
    lastMessageAt: row.lastMessageAt,
    lastMessagePreview: row.lastMessagePreview,
    isLastMessageSystem: lastMessage?.type === MessageType.SYSTEM,
    lot: {
      code: row.lot.code,
      title: row.lot.title,
      coverThumbUrl: cover
        ? `${base}/${cover.mediaAsset.thumbKey ?? cover.mediaAsset.storageKey}`
        : null,
      unitPrice: row.lot.unitPrice,
      status: row.lot.status,
    },
    counterpart: {
      id: counterpart.id,
      name: counterpart.name,
      avatarUrl: null, // TRS/MEDIA placeholder — see ConversationCounterpartDto
      verified: false, // TRS-001 placeholder — see ConversationCounterpartDto
    },
    myUnreadCount: isBuyer ? row.buyerUnreadCount : row.sellerUnreadCount,
    role: isBuyer ? 'buyer' : 'seller',
  };
}
