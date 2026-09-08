import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Paginated } from '../../common/dto/pagination-query.dto';
import { LotOffersQueryDto } from './dto/offer-query.dto';
import { OfferResponseDto } from './dto/offer-response.dto';
import { OffersService } from './offers.service';

/**
 * The seller's per-lot negotiation history (OFR-002): GET /lots/:lotId/offers.
 *
 * NOTE ON THE PATH (documented on the card): the plan's surface reads
 * `GET /lots/:id/offers` — the :id IS the LOT id here (the offers module
 * owns the endpoint; the /lots prefix is the resource it lists into).
 * Registered as a second controller inside the offers module so the offer
 * contract stays in one module; the two-segment route never collides with
 * LotsController's single-segment `GET /lots/:key` routes.
 *
 * SELLER hat (403 SELLER_REQUIRED) + owner-scoped read (404 for unknown AND
 * foreign lots — no existence oracle); newest first, every status, Paginated
 * with `myRole: 'seller'`.
 */
@ApiTags('offers')
@ApiBearerAuth('access-token')
@ApiExtraModels(OfferResponseDto)
@Controller('lots')
export class LotOffersController {
  constructor(private readonly offers: OffersService) {}

  @Get(':lotId/offers')
  @ApiOkResponse({
    description:
      'Paginated<OfferResponseDto>: { items, total, page, limit } — every offer on this lot, newest first, myRole = seller',
  })
  @ApiOperation({
    summary:
      'List the offers on my lot (owner only; 403 SELLER_REQUIRED without the seller hat, 404 unknown or foreign lot)',
  })
  async list(
    @CurrentUser() user: AuthUser,
    @Param('lotId') lotId: string,
    @Query() query: LotOffersQueryDto,
  ): Promise<Paginated<OfferResponseDto>> {
    return this.offers.listForLot(user.sub, lotId, query);
  }
}
