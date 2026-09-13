import { ApiProperty } from '@nestjs/swagger';
import { DealStatus } from '@prisma/client';
import { DealResponseDto } from './deal-response.dto';

/**
 * GET /deals/:code (DEAL-004) — the deal detail payload: the full
 * DealResponseDto allowlist PLUS the audit timeline the status-timeline
 * component renders. `events` is oldest first (the (dealId, createdAt) plan
 * index) with `actorRole` resolved SERVER-SIDE (buyer/seller, null for a
 * system event) so the UI never sees raw user ids.
 */
export class DealEventViewDto {
  @ApiProperty({ example: 'clx…cuid' })
  id!: string;

  @ApiProperty({
    enum: ['buyer', 'seller'],
    nullable: true,
    description: 'The acting side, resolved server-side from the actor id (null = system)',
  })
  actorRole!: 'buyer' | 'seller' | null;

  @ApiProperty({ enum: DealStatus, description: 'Status before the move (birth event repeats it)' })
  fromStatus!: DealStatus;

  @ApiProperty({ enum: DealStatus })
  toStatus!: DealStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'معامله ایجاد شد #9Xk2Qm7b',
    description: 'The fa note the move carried (creation + payment announcements, reasons)',
  })
  note!: string | null;

  @ApiProperty({ example: '2026-09-05T10:00:00.000Z' })
  createdAt!: Date;
}

export class DealDetailResponseDto extends DealResponseDto {
  @ApiProperty({ type: [DealEventViewDto], description: 'The audit timeline, oldest first' })
  events!: DealEventViewDto[];
}
