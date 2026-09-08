import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Paginated } from '../../common/dto/pagination-query.dto';
import { CounterOfferDto } from './dto/counter-offer.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { OfferListQueryDto } from './dto/offer-query.dto';
import { OfferResponseDto } from './dto/offer-response.dto';
import { OFFER_WRITE_THROTTLE } from './offers.constants';
import { OffersService } from './offers.service';

/**
 * Offer endpoints (OFR-002). Everything here is authenticated (@ApiBearerAuth;
 * the global JwtAuthGuard enforces it) and THROTTLED on the writes (30/min,
 * offers being a rate-limit-sensitive route). The role gates and state
 * machines live in OffersService:
 *
 * - POST /offers            — BUYER only (403 BUYER_REQUIRED / SELF_OFFER)
 * - POST /:id/counter       — the lot's SELLER (403 SELLER_REQUIRED /
 *                             OFFER_NOT_SELLER) → a NEW PENDING child offer
 * - POST /:id/accept        — the lot's SELLER (409 OFFER_EXPIRED /
 *                             LOT_NOT_ACTIVE / STALE_QUANTITY; siblings
 *                             auto-REJECT; creates the DEAL-002 eligibility)
 * - POST /:id/reject        — the lot's SELLER
 * - POST /:id/cancel        — the offer's own BUYER
 * - GET  /offers?role=…     — role-aware lists (buyer: mine; seller: on my
 *                             lots), optional status tab, Paginated
 *
 * Status codes: POST /offers and /counter answer 201 (they CREATE a row);
 * the decision actions answer 200 with the updated offer (no 204s — the
 * caller always gets the fresh state back, consistent across the controller).
 * GET /lots/:lotId/offers lives in lot-offers.controller.ts (same module,
 * /lots path prefix).
 */
@ApiTags('offers')
@ApiBearerAuth('access-token')
// Gen:types contract: OfferResponseDto is returned only wrapped in plain
// Paginated envelopes / action bodies swagger cannot express — registered
// explicitly so the generated schemas carry it.
@ApiExtraModels(OfferResponseDto)
@Controller('offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Post()
  @Throttle({
    default: { limit: OFFER_WRITE_THROTTLE.limit, ttl: OFFER_WRITE_THROTTLE.ttlMs },
  })
  @ApiCreatedResponse({
    type: OfferResponseDto,
    description:
      'The created PENDING offer (+72 h expiry); when tied to a conversation, its ACTION message + thread lockstep committed in the same transaction',
  })
  @ApiOperation({
    summary:
      'Make an offer on an ACTIVE lot as a buyer (403 BUYER_REQUIRED/SELF_OFFER/CONVERSATION_NOT_YOURS, 400 CONVERSATION_LOT_MISMATCH/price/note, 404 unknown lot, 409 LOT_NOT_ACTIVE/QUANTITY_OUT_OF_RANGE, 429 over 30/min)',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOfferDto,
  ): Promise<OfferResponseDto> {
    return this.offers.create(user.sub, dto);
  }

  @Get()
  @ApiOkResponse({
    description:
      'Paginated<OfferResponseDto>: { items, total, page, limit } — role=buyer: offers I made; role=seller: offers on my lots; newest first; myRole mirrors the requested role',
  })
  @ApiOperation({
    summary:
      'List my offers by side — ?role=buyer|seller (required) with optional ?status= tab and standard pagination',
  })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: OfferListQueryDto,
  ): Promise<Paginated<OfferResponseDto>> {
    return this.offers.listMine(user.sub, query);
  }

  @Post(':id/counter')
  @Throttle({
    default: { limit: OFFER_WRITE_THROTTLE.limit, ttl: OFFER_WRITE_THROTTLE.ttlMs },
  })
  @ApiCreatedResponse({
    type: OfferResponseDto,
    description:
      'The NEW PENDING child offer (parentId → the countered row, own fresh 72 h expiry); the countered row flips COUNTERED and the ACTION message lands in the tied thread — all in one transaction',
  })
  @ApiOperation({
    summary:
      'Counter an offer on my lot as its seller (403 role-gated, 409 OFFER_EXPIRED/ILLEGAL_TRANSITION/LOT_NOT_ACTIVE/stale terms, 400 price/note)',
  })
  async counter(
    @CurrentUser() user: AuthUser,
    @Param('id') offerId: string,
    @Body() dto: CounterOfferDto,
  ): Promise<OfferResponseDto> {
    return this.offers.counter(user.sub, offerId, dto);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: OFFER_WRITE_THROTTLE.limit, ttl: OFFER_WRITE_THROTTLE.ttlMs },
  })
  @ApiOkResponse({
    type: OfferResponseDto,
    description:
      'The ACCEPTED offer — the buyer’s other PENDING offers on the lot auto-REJECTED in the same transaction; this acceptance is the DEAL-002 deal-creation eligibility',
  })
  @ApiOperation({
    summary:
      'Accept an offer on my lot as its seller (403 role-gated, 409 OFFER_EXPIRED/LOT_NOT_ACTIVE/STALE_QUANTITY/ILLEGAL_TRANSITION)',
  })
  async accept(
    @CurrentUser() user: AuthUser,
    @Param('id') offerId: string,
  ): Promise<OfferResponseDto> {
    return this.offers.accept(user.sub, offerId);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: OFFER_WRITE_THROTTLE.limit, ttl: OFFER_WRITE_THROTTLE.ttlMs },
  })
  @ApiOkResponse({ type: OfferResponseDto, description: 'The REJECTED offer' })
  @ApiOperation({
    summary:
      'Reject an offer on my lot as its seller (403 role-gated, 409 OFFER_EXPIRED/ILLEGAL_TRANSITION)',
  })
  async reject(
    @CurrentUser() user: AuthUser,
    @Param('id') offerId: string,
  ): Promise<OfferResponseDto> {
    return this.offers.reject(user.sub, offerId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: OFFER_WRITE_THROTTLE.limit, ttl: OFFER_WRITE_THROTTLE.ttlMs },
  })
  @ApiOkResponse({
    type: OfferResponseDto,
    description: 'The CANCELLED offer (silent — no ACTION message)',
  })
  @ApiOperation({
    summary:
      'Withdraw my own offer as the buyer who made it (403 OFFER_NOT_BUYER, 409 OFFER_EXPIRED/ILLEGAL_TRANSITION)',
  })
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') offerId: string,
  ): Promise<OfferResponseDto> {
    return this.offers.cancel(user.sub, offerId);
  }
}
