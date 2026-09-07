import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { MessageType, type Message } from '@prisma/client';
import {
  MESSAGE_BODY_MAX_LENGTH,
  MESSAGES_DEFAULT_LIMIT,
  MESSAGES_MAX_LIMIT,
} from '../conversations.constants';

/**
 * CHT-003 — the Messages API contract under /conversations/:id/*. Only TEXT
 * sends exist today: IMAGE/VIDEO land in CHT-007, SYSTEM rows are written by
 * the server only (the CHT-001 welcome) and ACTION stays reserved (CHT-008
 * architecture note) — the DTO enum is deliberately restricted so any other
 * type answers 400 at the validation boundary.
 */

/** The only client-sendable message type (see the file header). */
export const SENDABLE_MESSAGE_TYPES = [MessageType.TEXT] as const;

/** `POST /conversations/:id/messages` body — the trimmed TEXT payload. */
export class SendMessageDto {
  @ApiPropertyOptional({
    enum: [MessageType.TEXT],
    default: MessageType.TEXT,
    description:
      'Message type — only TEXT is open for sends; IMAGE/VIDEO arrive with CHT-007 and anything else (incl. SYSTEM) answers 400',
  })
  @IsOptional()
  @IsIn(SENDABLE_MESSAGE_TYPES, { message: 'type must be TEXT (other types are not open yet)' })
  type: MessageType = MessageType.TEXT;

  @ApiProperty({
    example: 'قیمت برای ۵ ستون چقدر می‌شود؟',
    minLength: 1,
    maxLength: MESSAGE_BODY_MAX_LENGTH,
    description: `Trimmed message text — required for TEXT, 1..${MESSAGE_BODY_MAX_LENGTH} chars (validated AFTER trimming)`,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, MESSAGE_BODY_MAX_LENGTH)
  body!: string;
}

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
 */
export function toMessageResponse(row: Message): MessageResponseDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    type: row.type,
    body: row.body,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
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
