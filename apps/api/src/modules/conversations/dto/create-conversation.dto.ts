import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * `POST /conversations` body (CHT-001) — the lot to open (or resume) a thread
 * about. The buyer is the authenticated requester (never a body field); the
 * seller is derived server-side from the lot. No other input exists: one
 * thread per buyer per lot is the DB unique(lotId, buyerId), and repeated
 * calls are get-or-create idempotent.
 */
export class CreateConversationDto {
  @ApiProperty({ example: 'clx…cuid', description: 'The ACTIVE lot to open a conversation about' })
  @IsString()
  lotId!: string;
}
