import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { MediaType, MessageType, type Message } from '@prisma/client';
import {
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGES_DEFAULT_LIMIT,
  MESSAGES_MAX_LIMIT,
} from '../conversations.constants';

/**
 * CHT-003 — the Messages API contract under /conversations/:id/*. CHT-007
 * opens IMAGE/VIDEO sends: {type: IMAGE|VIDEO, mediaAssetId} with an EMPTY
 * body (media rows are body-less by contract); TEXT keeps requiring a
 * 1..2000 body and rejects mediaAssetId. SYSTEM rows are written by the
 * server only (the CHT-001 welcome) and ACTION stays reserved (CHT-008
 * architecture note) — the DTO enum is deliberately restricted so any other
 * type answers 400 at the validation boundary. The per-type cross-field
 * rules (body/mediaAssetId/ownership/type-match) live in the SERVICE (the
 * validation pipe has no clean access to the asset row).
 */

/** The client-sendable message types (see the file header). */
export const SENDABLE_MESSAGE_TYPES = [
  MessageType.TEXT,
  MessageType.IMAGE,
  MessageType.VIDEO,
] as const;

/** `POST /conversations/:id/messages` body — TEXT or a media reference. */
export class SendMessageDto {
  @ApiPropertyOptional({
    enum: SENDABLE_MESSAGE_TYPES,
    default: MessageType.TEXT,
    description:
      'Message type — TEXT (default; requires body), IMAGE/VIDEO (require mediaAssetId, body must be empty); SYSTEM/ACTION answer 400',
  })
  @IsOptional()
  @IsIn(SENDABLE_MESSAGE_TYPES, {
    message: 'type must be TEXT, IMAGE or VIDEO (other types are not open)',
  })
  type: MessageType = MessageType.TEXT;

  @ApiPropertyOptional({
    example: 'قیمت برای ۵ ستون چقدر می‌شود؟',
    maxLength: MESSAGE_BODY_MAX_LENGTH,
    description: `Trimmed message text — REQUIRED for TEXT (1..${MESSAGE_BODY_MAX_LENGTH} chars post-trim, enforced service-side) and must be EMPTY for IMAGE/VIDEO`,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @Length(0, MESSAGE_BODY_MAX_LENGTH)
  body?: string;

  @ApiPropertyOptional({
    example: 'clx…cuid',
    description:
      'MediaAsset id — REQUIRED for IMAGE/VIDEO, must be owned by the sender (else 403 MEDIA_NOT_OWNED) and its MediaType must match the message type (else 400)',
  })
  @IsOptional()
  @IsString()
  mediaAssetId?: string;
}

/** The media block joined onto a message row (media messages only). */
export type MessageMediaBlock = {
  storageKey: string;
  thumbKey: string | null;
} | null;

export class MessageResponseDto {
  @ApiProperty({ example: 'clx…cuid', description: 'Message id — also the list `before` cursor' })
  id!: string;

  @ApiProperty({ example: 'clx…cuid' })
  conversationId!: string;

  @ApiProperty({
    example: 'clx…cuid',
    nullable: true,
    type: String,
    description: 'Author — null exactly for SYSTEM rows',
  })
  senderId!: string | null;

  @ApiProperty({ enum: MessageType, example: 'TEXT' })
  type!: MessageType;

  @ApiProperty({ example: 'سلام، موجود است؟', nullable: true, type: String })
  body!: string | null;

  @ApiProperty({
    example: null,
    nullable: true,
    type: String,
    description: 'Referenced MediaAsset id — null for TEXT/SYSTEM rows (CHT-007)',
  })
  mediaAssetId!: string | null;

  @ApiProperty({
    example: '2026/09/abc123.mp4',
    nullable: true,
    type: String,
    description:
      'Storage key of the referenced asset (original bytes). Render through GET /media/secure/{key} with a bearer token — never the public route (CHT-007)',
  })
  mediaStorageKey!: string | null;

  @ApiProperty({
    example: '2026/09/abc123pt.webp',
    nullable: true,
    type: String,
    description:
      'Cheaper preview key — IMAGE: the 1200w WebP cover variant; VIDEO: the poster thumb ({id}pt.webp); null when the asset has none (videos may be poster-less)',
  })
  mediaPreviewKey!: string | null;

  @ApiProperty({ example: '2026-09-05T00:00:00.000Z', description: 'ASC history sort key' })
  createdAt!: Date;

  @ApiProperty({
    example: null,
    nullable: true,
    type: Date,
    description:
      'Read stamp set when the COUNTERPART calls POST /conversations/:id/read; null = unread',
  })
  readAt!: Date | null;
}

/**
 * Allowlist mapper — copies ONLY the MessageResponseDto fields. The send
 * transaction returns the freshly created row through this mapper (the clean
 * seam CHT-004's gateway needs: emit the SAME payload after the service
 * resolves), and every history row maps through it too — SYSTEM rows visible.
 * `mediaAsset` (MESSAGE_MEDIA_INCLUDE join) feeds the CHT-007 media keys; a
 * row read WITHOUT the join (or a TEXT/SYSTEM row) maps them null.
 */
export function toMessageResponse(
  row: Message & { mediaAsset?: MessageMediaBlock },
): MessageResponseDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    type: row.type,
    body: row.body,
    mediaAssetId: row.mediaAssetId,
    mediaStorageKey: row.mediaAsset?.storageKey ?? null,
    mediaPreviewKey: row.mediaAsset?.thumbKey ?? null,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}

/** Guard for the send path: the MessageType that matches a MediaType. */
export function messageTypeForMedia(type: MediaType): MessageType {
  return type === MediaType.IMAGE ? MessageType.IMAGE : MessageType.VIDEO;
}

/**
 * Query params for `GET /conversations/:id/messages` — NOT the shared
 * Paginated contract: chat history loads BACKWARDS (the card mandates the
 * cursor shape below). `before` is a message id; the page is the ≤ limit
 * messages STRICTLY OLDER than it, ordered ASC (ending at the cursor).
 */
export class MessageListQueryDto {
  @ApiPropertyOptional({
    example: 'clx…cuid',
    description:
      'Cursor — return messages strictly OLDER than this message id; omit for the newest page',
  })
  @IsOptional()
  @IsString()
  before?: string;

  @ApiPropertyOptional({
    default: MESSAGES_DEFAULT_LIMIT,
    minimum: 1,
    maximum: MESSAGES_MAX_LIMIT,
    description: `Page size — capped at ${MESSAGES_MAX_LIMIT}`,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MESSAGES_MAX_LIMIT)
  limit = MESSAGES_DEFAULT_LIMIT;
}

/**
 * The history envelope (deliberately NOT Paginated<T> — no page/total: the
 * thread grows in real time and the client walks it backwards):
 * - `items`: ASC (oldest → newest), ending at the cursor;
 * - `hasMore`: OLDER messages exist beyond this page;
 * - `nextCursor`: id of the OLDEST returned item — pass it as `before` for
 *   the next (older) page; null once history is exhausted (hasMore false).
 */
export class MessagePageDto {
  @ApiProperty({ type: () => [MessageResponseDto], description: 'ASC order, ending at the cursor' })
  items!: MessageResponseDto[];

  @ApiProperty({ example: true, description: 'True when older messages exist beyond this page' })
  hasMore!: boolean;

  @ApiPropertyOptional({
    example: 'clx…cuid',
    nullable: true,
    type: String,
    description: 'Oldest returned id — the next page `before` cursor; null when hasMore is false',
  })
  nextCursor!: string | null;
}

/** `POST /conversations/:id/read` response — the simple { readCount } shape
 * (documented decision on the card): how many of the COUNTERPART's unread
 * messages this call stamped readAt = now. */
export class MarkConversationReadResponseDto {
  @ApiProperty({ example: 4, description: 'Counterpart messages marked read by this call' })
  readCount!: number;
}
