import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { Paginated } from '../../common/dto/pagination-query.dto';
import { CreateLotDto } from './dto/create-lot.dto';
import { LotCardResponseDto, LotCardSellerDto } from './dto/lot-card.dto';
import { LotOwnerResponseDto, LotPublicResponseDto } from './dto/lot-response.dto';
import { PutLotMediaDto } from './dto/lot-media.dto';
import { LotsPublicQueryDto } from './dto/lots-public-query.dto';
import { MyLotsQueryDto } from './dto/my-lots-query.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { LotsService } from './lots.service';

/**
 * Lot endpoints. The public listing (MKT-001, GET /lots) is @Public and
 * returns the CARD shape; everything else is owner-scoped (LOT-002 create/edit
 * + LOT-003 lifecycle actions + LOT-005 owner reads: GET /lots/mine and
 * GET /lots/:id). The global JwtAuthGuard authenticates those; the seller hat
 * and ownership are business rules asserted in LotsService (403
 * SELLER_REQUIRED / 403 non-owner / 404 missing / 409 ILLEGAL_STATUS_EDIT on
 * PATCH, 409 ILLEGAL_TRANSITION (+ EXPIRED on a stale resume) on the action
 * routes). Owner routes return the OWNER response shape; LotPublicResponseDto
 * is registered via @ApiExtraModels so the generated contract (gen:types)
 * carries the public schema no endpoint returns.
 *
 * Status codes: POST /lots and the duplicate action return 201 (they CREATE a
 * row); the other lifecycle actions return 200 with the updated lot's owner
 * body (no 204s — the caller always gets the fresh state back, consistent
 * across the whole controller).
 */
@ApiTags('lots')
@ApiBearerAuth('access-token')
// Gen:types contract: LotPublicResponseDto is the public shape no endpoint
// returns yet (MKT-009 detail owns it); LotCardResponseDto IS returned by
// GET /lots but through a Paginated envelope, which swagger cannot express —
// both are registered explicitly so the generated schemas carry them.
@ApiExtraModels(LotPublicResponseDto, LotCardResponseDto, LotCardSellerDto)
@Controller('lots')
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  /**
   * MKT-001 — public marketplace listing. Declared FIRST: the root route and
   * the `:id` route never overlap, but the read order mirrors the docs
   * (browse → mine → owner detail). Card-shaped payload, ACTIVE-only, sort
   * allowlist (unknown sort → 400 via the query DTO), pagination capped by
   * the shared DTO (limit ≤ 100).
   */
  @Get()
  @Public()
  @ApiOkResponse({
    description:
      'Paginated<LotCardResponseDto>: { items, total, page, limit } — ACTIVE lots only, cards carry the cover thumb + seller summary',
  })
  @ApiOperation({
    summary:
      'Public lot listing — ACTIVE lots only, card payload (no auth); sort=createdAt|updatedAt|priceAsc|priceDesc|quantityAsc|quantityDesc|expiresAt',
  })
  async findPublic(@Query() query: LotsPublicQueryDto): Promise<Paginated<LotCardResponseDto>> {
    return this.lots.findPublic(query);
  }

  @Post()
  @ApiCreatedResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary:
      'Create a lot as the seller — submit=false (default) saves a DRAFT, submit=true submits for moderation',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLotDto,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.create(user.sub, dto);
  }

  /**
   * LOT-005 — seller inventory. Declared BEFORE the `:id` GET route below:
   * Nest matches routes in declaration order, so `mine` must win over `:id`.
   */
  @Get('mine')
  @ApiOkResponse({
    description: 'Paginated<LotOwnerResponseDto>: { items, total, page, limit } — newest first',
  })
  @ApiOperation({
    summary:
      "List the caller's lots — every non-REMOVED status (optional ?status= tab filter), newest first",
  })
  async mine(
    @CurrentUser() user: AuthUser,
    @Query() query: MyLotsQueryDto,
  ): Promise<Paginated<LotOwnerResponseDto>> {
    return this.lots.findMine(user.sub, query);
  }

  /**
   * LOT-005 — owner single read (completes the LOT-004 edit-load flow).
   * REMOVED lots stay resolvable here (LOT-003 soft-delete semantics) while
   * never appearing in `mine` above.
   */
  @Get(':id')
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary:
      'Read one owned lot (owner shape incl. exactAddress/rejectionReason/media) — 404 missing, 403 foreign',
  })
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.findOwned(user.sub, id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary: 'Submit an owned DRAFT/REJECTED lot for moderation — PENDING_REVIEW, +30d expiry',
  })
  async submit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.submit(user.sub, id);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({ summary: 'Pause an owned ACTIVE lot — hidden from the public listing' })
  async pause(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.pause(user.sub, id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary: 'Resume an owned PAUSED lot — ACTIVE again; 409 EXPIRED if expiresAt already passed',
  })
  async resume(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.resume(user.sub, id);
  }

  @Post(':id/mark-sold')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({ summary: 'Mark an owned ACTIVE/PAUSED lot as SOLD — soldAt=now, availability 0' })
  async markSold(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.markSold(user.sub, id);
  }

  @Post(':id/duplicate')
  @ApiCreatedResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary:
      'Duplicate any non-REMOVED owned lot into a NEW DRAFT — fresh code/expiry, zeroed counters',
  })
  async duplicate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.duplicate(user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary: 'Soft-delete an owned non-SOLD lot — status REMOVED + deletedAt=now (SOLD → 409)',
  })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.remove(user.sub, id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary:
      'Edit an owned lot — DRAFT/REJECTED fully editable (submit=true resubmits); ACTIVE/PAUSED only price/quantity fields; otherwise 409',
  })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLotDto,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.update(user.sub, id, dto);
  }

  @Put(':id/media')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary:
      'Replace an owned DRAFT/REJECTED lot’s ordered gallery (items + coverIndex) — per-kind caps enforced, 409 while listed/under moderation',
  })
  async putMedia(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PutLotMediaDto,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.putMedia(user.sub, id, dto);
  }
}
