import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OfferStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { OFFER_MY_ROLES } from '../offers.constants';

/**
 * Query params for the offer listings (OFR-002).
 *
 * GET /offers is ROLE-AWARE: `role` (required) picks the caller's side —
 * `buyer` = offers I made, `seller` = offers on my lots (the OFR-004 tabs
 * «ارسالی» / «دریافی» hang off this one param). An omitted/unknown role is a
 * 400 — there is no "both sides" mode by design (the payload's `myRole` and
 * the scope must never disagree).
 *
 * GET /lots/:lotId/offers reuses the pagination half only (LotOffersQueryDto
 * below): the seller is fixed by the path, the ordering is fixed to newest
 * first. Like MyLotsQueryDto, the inherited `sort` param is intentionally NOT
 * honoured — the card mandates a fixed order for both lists.
 */
export class OfferListQueryDto extends PaginationQueryDto {
  @ApiProperty({
    enum: OFFER_MY_ROLES,
    description:
      'Which side of the negotiation to list — buyer: offers I made; seller: offers on my lots',
  })
  @IsIn(OFFER_MY_ROLES, { message: 'role must be one of: ' + OFFER_MY_ROLES.join(', ') })
  role!: (typeof OFFER_MY_ROLES)[number];

  @ApiPropertyOptional({
    enum: OfferStatus,
    description: 'Optional single-status tab filter (omitted = every status)',
  })
  @IsOptional()
  @IsEnum(OfferStatus, {
    message: 'status must be one of: ' + Object.values(OfferStatus).join(', '),
  })
  status?: OfferStatus;
}

/** Query params for GET /lots/:lotId/offers — pagination only, fixed order. */
export class LotOffersQueryDto extends PaginationQueryDto {}
