import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ConversationStatus,
  LotStatus,
  type Conversation,
  type Lot,
  type LotMedia,
  type MediaAsset,
} from '@prisma/client';

/**
 * CHT-001 — the response of `POST /conversations` (get-or-create). Strict
 * allowlist shape: the conversation's identity/participants/timestamps plus
 * the lot context the chat UI always renders (CHT-006 header). Deliberately
 * NOT in the payload (allowlist + unit/e2e tests pin the key set):
 * - unread counters (`buyerUnreadCount`/`sellerUnreadCount`) — they move with
 *   messages (CHT-003); the list payload that needs them is CHT-002's.
 * - `lastMessagePreview` — the inbox renders it, this creation response does
 *   not (the client just navigated from the lot page).
 * - `updatedAt` — no client use at creation time.
 */

/** The lot summary the chat surface always shows (title + price + thumb). */
export class ConversationLotSummaryDto {
  @ApiProperty({
    example: '7Kd2Qm9x',
    description: 'Public lot code — the «مشاهده لات» link target (/l/{code})',
    minLength: 8,
    maxLength: 8,
  })
  code!: string;

  @ApiProperty({ example: 'عمده پیراهن مردانه — ۵۰ عدد' })
  title!: string;

  @ApiPropertyOptional({
    example: 'http://localhost:3001/media/2026/09/abc…123t.webp',
    nullable: true,
    type: String,
    description:
      'Absolute cover thumb (PUBLIC_MEDIA_BASE_URL + thumbKey falling back to storageKey); null when the lot has no cover',
  })
  coverThumbUrl!: string | null;

  @ApiProperty({ example: 2_250_000, description: 'Derived per-unit price (Toman)' })
  unitPrice!: number;

  @ApiProperty({ enum: LotStatus, example: 'ACTIVE' })
  status!: LotStatus;
}

export class ConversationResponseDto {
  @ApiProperty({ example: 'clx…cuid', description: 'Conversation id — thread route param' })
  id!: string;

  @ApiProperty({ example: 'clx…cuid' })
  lotId!: string;

  @ApiProperty({ example: 'clx…cuid', description: 'The requesting buyer (thread creator)' })
  buyerId!: string;

  @ApiProperty({
    example: 'clx…cuid',
    description: 'Derived server-side from the lot — never client-supplied',
  })
  sellerId!: string;

  @ApiProperty({ enum: ConversationStatus, example: 'ACTIVE' })
  status!: ConversationStatus;

  @ApiProperty({ example: '2026-09-05T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-09-05T00:00:00.000Z',
    description: 'Newest-message stamp — set to the welcome message on create (CHT-003 moves it)',
  })
  lastMessageAt!: Date;

  @ApiProperty({ type: ConversationLotSummaryDto })
  lot!: ConversationLotSummaryDto;
}

/** The cover link the mapper picks from (structurally — fakes qualify). */
export type ConversationCoverRow = Pick<LotMedia, 'isCover'> & {
  mediaAsset: Pick<MediaAsset, 'thumbKey' | 'storageKey'>;
};

/** Repository row the mapper consumes: the Conversation + its lot with the cover links. */
export type ConversationRepositoryRow = Conversation & {
  lot: Lot & { media?: ConversationCoverRow[] };
};

/**
 * Allowlist mapper — copies ONLY the fields above. The conversation row is
 * joined with its lot (cover media links included) so the whole payload maps
 * from ONE read; `mediaBaseUrl` is resolved by the caller (service boundary)
 * so the mapper stays pure. The cover link is picked by its `isCover` flag.
 */
export function toConversationResponse(
  row: ConversationRepositoryRow,
  mediaBaseUrl: string,
): ConversationResponseDto {
  const base = mediaBaseUrl.replace(/\/+$/, '');
  const cover = (row.lot.media ?? []).find((link) => link.isCover);
  return {
    id: row.id,
    lotId: row.lotId,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    status: row.status,
    createdAt: row.createdAt,
    lastMessageAt: row.lastMessageAt,
    lot: {
      code: row.lot.code,
      title: row.lot.title,
      coverThumbUrl: cover
        ? `${base}/${cover.mediaAsset.thumbKey ?? cover.mediaAsset.storageKey}`
        : null,
      unitPrice: row.lot.unitPrice,
      status: row.lot.status,
    },
  };
}
