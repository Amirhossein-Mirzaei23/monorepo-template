import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateDealDto } from './dto/create-deal.dto';
import { DealResponseDto } from './dto/deal-response.dto';
import { DEAL_WRITE_THROTTLE } from './deals.constants';
import { DealsService } from './deals.service';

/**
 * Deal endpoints (DEAL-002). Everything here is authenticated
 * (@ApiBearerAuth; the global JwtAuthGuard enforces it) and THROTTLED on the
 * writes (30/min, deals being a rate-limit-sensitive money route like
 * offers). The role gates and the state rules live in DealsService:
 *
 * - POST /deals — BUYER only (403 BUYER_REQUIRED), from exactly one of an
 *   ACCEPTED offer (404 unknown / 403 OFFER_NOT_BUYER / 409
 *   OFFER_EXPIRED|OFFER_NOT_ACCEPTED) or the caller's own conversation thread
 *   (403 CONVERSATION_NOT_YOURS, 409 LOT_NOT_FIXED_PRICE). The lot must be
 *   ACTIVE (409 LOT_NOT_ACTIVE) with stock for the quantity (409
 *   INSUFFICIENT_QUANTITY / QUANTITY_OUT_OF_RANGE); creation RESERVES the
 *   quantity transactionally (restore on cancel — DealsService.transition).
 *
 * Status codes: POST /deals answers 201 (it creates the row — the caller
 * always gets the fresh deal back). The transition endpoints are DEAL-003.
 */
@ApiTags('deals')
@ApiBearerAuth('access-token')
@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @Post()
  @Throttle({
    default: { limit: DEAL_WRITE_THROTTLE.limit, ttl: DEAL_WRITE_THROTTLE.ttlMs },
  })
  @ApiCreatedResponse({
    type: DealResponseDto,
    description:
      'The created NEGOTIATING deal — terms locked (lot/qty/price snapshot, delivery/payment), quantity RESERVED on the lot; when tied to a conversation, its ACTION message + thread lockstep committed in the same transaction',
  })
  @ApiOperation({
    summary:
      'Create a deal as a buyer from an accepted offer (offerId) or a fixed-price conversation (conversationId) — 403 BUYER_REQUIRED/OFFER_NOT_BUYER/CONVERSATION_NOT_YOURS, 400 provenance/terms, 404 unknown offer, 409 lot/offer state or quantity, 429 over 30/min',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDealDto,
  ): Promise<DealResponseDto> {
    return this.deals.create(user.sub, dto);
  }
}
