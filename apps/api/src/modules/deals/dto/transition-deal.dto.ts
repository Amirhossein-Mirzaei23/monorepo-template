import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DealStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { DEAL_DISPUTE_REASON_MIN_LENGTH, DEAL_NOTE_MAX_LENGTH } from '../deals.constants';

/**
 * `POST /deals/:code/transition` body (DEAL-003) — the target status plus an
 * optional note. The PERMISSION matrix is NOT input: the caller's hat is
 * resolved from the deal row (buyerId/sellerId vs the authenticated user) and
 * checked against DEAL_TRANSITIONS — a 409 ILLEGAL_TRANSITION body carries the
 * `allowed` next states (+ `allowedFa` rendering) when the move does not
 * exist, a 403 TRANSITION_ROLE_FORBIDDEN when it exists but this side may not
 * perform it.
 *
 * Note rules live with the matrix (DealsService.transition): →CANCELLED and
 * →DISPUTED require it (400 REASON_REQUIRED), →DISPUTED additionally wants
 * ≥ DEAL_DISPUTE_REASON_MIN_LENGTH code points (400 DISPUTE_REASON_TOO_SHORT).
 */
export class TransitionDealDto {
  @ApiProperty({
    enum: DealStatus,
    example: DealStatus.AGREED,
    description:
      'The target status — must be a legal move from the deal’s current status (409 with the allowed list) for the caller’s role (403)',
  })
  @IsEnum(DealStatus)
  to!: DealStatus;

  @ApiPropertyOptional({
    example: 'خریدار مذاکره را می‌پذیرد',
    maxLength: DEAL_NOTE_MAX_LENGTH,
    description: `Required for →CANCELLED / →DISPUTED (the reason; ≥ ${DEAL_DISPUTE_REASON_MIN_LENGTH} code points for disputes); optional context elsewhere — ≤ ${DEAL_NOTE_MAX_LENGTH} characters, trimmed, empty → null`,
  })
  @IsOptional()
  @IsString()
  @Length(0, DEAL_NOTE_MAX_LENGTH)
  note?: string;
}
