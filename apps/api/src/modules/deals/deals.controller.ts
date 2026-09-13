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
import { CancelDealDto } from './dto/cancel-deal.dto';
import { CreateDealDto } from './dto/create-deal.dto';
import { DealDetailResponseDto } from './dto/deal-detail-response.dto';
import { DealListQueryDto } from './dto/deal-query.dto';
import { DealResponseDto } from './dto/deal-response.dto';
import { TransitionDealDto } from './dto/transition-deal.dto';
import { DEAL_WRITE_THROTTLE } from './deals.constants';
import { DealsService } from './deals.service';

/**
 * Deal endpoints (DEAL-002 creation + DEAL-003 transitions). Everything here
 * is authenticated (@ApiBearerAuth; the global JwtAuthGuard enforces it) and
 * THROTTLED on the writes (30/min, deals being a rate-limit-sensitive money
 * route like offers). The role gates and the state rules live in
 * DealsService:
 *
 * - POST /deals — BUYER only (403 BUYER_REQUIRED), from exactly one of an
 *   ACCEPTED offer (404 unknown / 403 OFFER_NOT_BUYER / 409
 *   OFFER_EXPIRED|OFFER_NOT_ACCEPTED) or the caller's own conversation thread
 *   (403 CONVERSATION_NOT_YOURS, 409 LOT_NOT_FIXED_PRICE). The lot must be
 *   ACTIVE (409 LOT_NOT_ACTIVE) with stock for the quantity (409
 *   INSUFFICIENT_QUANTITY / QUANTITY_OUT_OF_RANGE); creation RESERVES the
 *   quantity transactionally (restore on cancel — the cancel/transition
 *   endpoints below).
 * - POST /deals/:code/transition — the DEAL-001 matrix, participant-gated
 *   (404 DEAL_NOT_FOUND, 403 DEAL_NOT_PARTICIPANT): a (from, to) pair the
 *   table does not know is 409 ILLEGAL_TRANSITION (payload carries the
 *   `allowed` next states + `allowedFa`), a known pair the caller's hat may
 *   not perform is 403 TRANSITION_ROLE_FORBIDDEN; →CANCELLED/→DISPUTED need
 *   the note (400 REASON_REQUIRED, disputes ≥ 20 chars — 400
 *   DISPUTE_REASON_TOO_SHORT). Clean cancellations restore the reserved
 *   quantity transactionally.
 * - POST /deals/:code/cancel — the reason-shaped →CANCELLED shorthand.
 * - POST /deals/:code/payment-confirm — the buyer's «پرداخت کردم» mark
 *   (403 PAYMENT_CONFIRM_BUYER_ONLY; 409 PAYMENT_NOT_PENDING /
 *   PAYMENT_ALREADY_CONFIRMED): stamps paidConfirmedByBuyerAt + an
 *   informational DealEvent; only the seller's confirm moves the status.
 *
 * Status codes: POST /deals answers 201 (it creates the row — the caller
 * always gets the fresh deal back); the :code routes answer 200 — they move
 * or mark an existing row and return its fresh allowlisted payload.
 */
@ApiTags('deals')
@ApiBearerAuth('access-token')
// Gen:types contract: the detail DTO extends the base response — both are
// registered so the generated schemas carry the full detail shape.
@ApiExtraModels(DealResponseDto, DealDetailResponseDto)
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

  @Post(':code/transition')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: DEAL_WRITE_THROTTLE.limit, ttl: DEAL_WRITE_THROTTLE.ttlMs },
  })
  @ApiOkResponse({
    type: DealResponseDto,
    description:
      'The deal in its new status — the DEAL-001 matrix row executed (stage stamp + DealEvent appended, clean cancellations restore the reserved quantity) in one transaction',
  })
  @ApiOperation({
    summary:
      'Move a deal I am the buyer or seller of to `to` (404 DEAL_NOT_FOUND, 403 DEAL_NOT_PARTICIPANT/TRANSITION_ROLE_FORBIDDEN, 409 ILLEGAL_TRANSITION with the allowed next states, 400 REASON_REQUIRED/DISPUTE_REASON_TOO_SHORT/NOTE_TOO_LONG)',
  })
  async transition(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Body() dto: TransitionDealDto,
  ): Promise<DealResponseDto> {
    return this.deals.transitionFromCode(code, user.sub, dto);
  }

  @Post(':code/cancel')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: DEAL_WRITE_THROTTLE.limit, ttl: DEAL_WRITE_THROTTLE.ttlMs },
  })
  @ApiOkResponse({
    type: DealResponseDto,
    description:
      'The CANCELLED deal — the reason stored on cancelReason + the timeline event; cancellations from the pre-fulfilment stages (NEGOTIATING/AGREED/PAYMENT_PENDING) restore the reserved quantity in the same transaction',
  })
  @ApiOperation({
    summary:
      'Cancel a deal I am a participant of, with a reason (404 DEAL_NOT_FOUND, 403 DEAL_NOT_PARTICIPANT/TRANSITION_ROLE_FORBIDDEN per the matrix, 400 REASON_REQUIRED)',
  })
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Body() dto: CancelDealDto,
  ): Promise<DealResponseDto> {
    return this.deals.cancelFromCode(code, user.sub, dto.reason);
  }

  @Post(':code/payment-confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: DEAL_WRITE_THROTTLE.limit, ttl: DEAL_WRITE_THROTTLE.ttlMs },
  })
  @ApiOkResponse({
    type: DealResponseDto,
    description:
      'The deal with the buyer’s payment mark (paidConfirmedByBuyerAt) and the informational «خریدار پرداخت را اعلام کرد» timeline event — the STATUS only moves when the seller confirms (PAYMENT_PENDING→PAID)',
  })
  @ApiOperation({
    summary:
      'As the buyer, announce «پرداخت کردم» on a PAYMENT_PENDING deal (404 DEAL_NOT_FOUND, 403 DEAL_NOT_PARTICIPANT/PAYMENT_CONFIRM_BUYER_ONLY, 409 PAYMENT_NOT_PENDING/PAYMENT_ALREADY_CONFIRMED)',
  })
  async paymentConfirm(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
  ): Promise<DealResponseDto> {
    return this.deals.confirmPaymentFromCode(code, user.sub);
  }

  // --- DEAL-004: the reads the deals UI consumes ---

  @Get()
  @ApiOkResponse({
    description:
      'Paginated<DealResponseDto>: { items, total, page, limit } — role=buyer: deals I struck (خرید tab); role=seller: deals on my lots (فروش tab); most-recent-activity first; myRole mirrors the requested role',
  })
  @ApiOperation({
    summary:
      'List my deals by side — ?role=buyer|seller (required) with optional ?status= chip filter and standard pagination',
  })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: DealListQueryDto,
  ): Promise<Paginated<DealResponseDto>> {
    return this.deals.listMine(user.sub, query);
  }

  @Get(':code')
  @ApiOkResponse({
    type: DealDetailResponseDto,
    description:
      "The allowlisted deal plus its audit timeline (oldest first) with actorRole resolved server-side — the DEAL-004 detail page's single read",
  })
  @ApiOperation({
    summary:
      'Fetch one deal I participate in, by its public code, with the full timeline (404 DEAL_NOT_FOUND, 403 DEAL_NOT_PARTICIPANT)',
  })
  async detail(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
  ): Promise<DealDetailResponseDto> {
    return this.deals.detailByCode(code, user.sub);
  }
}
