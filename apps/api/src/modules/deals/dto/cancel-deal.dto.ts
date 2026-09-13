import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { DEAL_NOTE_MAX_LENGTH } from '../deals.constants';

/**
 * `POST /deals/:code/cancel` body (DEAL-003) — the reason-shaped shorthand for
 * `POST /deals/:code/transition` with `to: CANCELLED`: same matrix row (who
 * may cancel depends on the current status), same DealEvent, and the reason
 * lands in `cancelReason` + the timeline note. Whitespace-only reasons pass
 * the shape check and fail in the service (400 REASON_REQUIRED) — one
 * emptiness rule, the matrix's requiresReason.
 */
export class CancelDealDto {
  @ApiProperty({
    example: 'خریدار پاسخگو نبود',
    minLength: 1,
    maxLength: DEAL_NOTE_MAX_LENGTH,
    description: `Why the deal is cancelled — required (400 REASON_REQUIRED on empty), ≤ ${DEAL_NOTE_MAX_LENGTH} characters; stored on the deal and carried by the timeline event`,
  })
  @IsString()
  @Length(1, DEAL_NOTE_MAX_LENGTH)
  reason!: string;
}
