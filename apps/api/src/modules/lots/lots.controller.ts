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
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { requireAppConfig } from '../../config/configuration';
import type { Paginated } from '../../common/dto/pagination-query.dto';
import { CreateLotDto } from './dto/create-lot.dto';
import { LotCardResponseDto, LotCardSellerDto } from './dto/lot-card.dto';
import { LotPublicDetailResponseDto } from './dto/lot-detail.dto';
import { LotOwnerResponseDto, LotPublicResponseDto } from './dto/lot-response.dto';
import { PutLotMediaDto } from './dto/lot-media.dto';
import { LotsPublicQueryDto } from './dto/lots-public-query.dto';
import { MyLotsQueryDto } from './dto/my-lots-query.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { LotKeyAccessGuard } from './lot-key-access.guard';
import { isLotPublicCode, lotViewCookieName, LOT_VIEW_DEDUP_MINUTES } from './lots.constants';
import { LotsService } from './lots.service';

/** Same cookie/user surface the auth controller reads (cookieParser is global;
 * `user` is attached by JwtAuthGuard — via LotKeyAccessGuard on this route). */
type CookiesRequest = Request & { cookies?: Record<string, string>; user?: AuthUser };

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
 * MKT-009: the single-segment GET route is SHARED — `/lots/:code` (public
 * detail) and `/lots/:id` (owner read) are the same Express pattern, so one
 * `@Get(':key')` route dispatches on the key shape (isLotPublicCode): an
 * 8-char base62 code serves the public detail (anonymous, 404 for
 * non-public lots) and a cuid keeps the untouched owner contract. See
 * LotKeyAccessGuard + findDetailOrOwned below.
 *
 * Status codes: POST /lots and the duplicate action return 201 (they CREATE a
 * row); the other lifecycle actions return 200 with the updated lot's owner
 * body (no 204s — the caller always gets the fresh state back, consistent
 * across the whole controller).
 */
@ApiTags('lots')
@ApiBearerAuth('access-token')
// Gen:types contract: LotPublicResponseDto is the public base schema no
// endpoint returns directly (the owner shape extends it); LotCardResponseDto
// IS returned by GET /lots and nested in the MKT-009 detail's `similar`, but
// through Paginated envelopes / arrays swagger cannot express — all are
// registered explicitly so the generated schemas carry them.
@ApiExtraModels(LotPublicResponseDto, LotCardResponseDto, LotCardSellerDto)
@Controller('lots')
export class LotsController {
  constructor(
    private readonly lots: LotsService,
    private readonly config: ConfigService,
  ) {}

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
   * LOT-005 — seller inventory. Declared BEFORE the shared `:key` GET route
   * below: Nest matches routes in declaration order, so `mine` must win over
   * the single-segment parameter route.
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
   * MKT-009 — public lot detail BY CODE, sharing one path pattern with the
   * LOT-005 owner single read BY ID. The plan's API surface serves both
   * `GET /lots/:code` and `GET /lots/:id`, but Express matches routes in
   * declaration order and the two are the SAME single-segment pattern — two
   * handlers cannot coexist. One `@Get(':key')` route therefore dispatches on
   * the key shape (isLotPublicCode — the 8-char base62 code space and the
   * 25-char cuid space are disjoint):
   *
   * - 8-char base62 key → PUBLIC detail: @Public + LotKeyAccessGuard lets it
   *   through anonymous; LotsService 404s anything not ACTIVE+unexpired+not
   *   deleted (public view, no oracle). Payload is the strict
   *   LotPublicDetailResponseDto allowlist (never exactAddress /
   *   rejectionReason / seller contact). First view per 30 min bumps
   *   viewCount (dedup cookie, fire-and-forget — recordLotView below).
   * - cuid key → the UNCHANGED LOT-005 owner contract: the guard enforces the
   *   bearer exactly like the global JwtAuthGuard, then LotsService.findOwned
   *   answers 401/403/404 + the owner shape (exactAddress/rejectionReason).
   */
  @Get(':key')
  @Public()
  @UseGuards(LotKeyAccessGuard)
  @ApiOkResponse({
    type: LotPublicDetailResponseDto,
    description:
      'LotPublicDetailResponseDto for an 8-char lot code (public, 404 unless ACTIVE); LotOwnerResponseDto for a cuid id (bearer, owner shape)',
  })
  @ApiOperation({
    summary:
      'Public lot detail by 8-char code (anonymous, ACTIVE-only, similar lots included) OR the owned lot by cuid id (bearer → owner shape)',
  })
  async findDetailOrOwned(
    @Req() request: CookiesRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('key') key: string,
  ): Promise<LotPublicDetailResponseDto | LotOwnerResponseDto> {
    // `user` is set only on the owner branch (LotKeyAccessGuard ran the JWT
    // verification); the public branch is anonymous by design. The plain read
    // (not @CurrentUser) is deliberate — the decorator 500s on optional users.
    const user = request.user;
    if (isLotPublicCode(key)) {
      const detail = await this.lots.findPublicByCode(key);
      this.recordLotView(key, detail.id, request, response);
      return detail;
    }
    if (user === undefined) {
      // Unreachable: LotKeyAccessGuard already 401s anonymous non-code keys.
      throw new UnauthorizedException('Missing bearer access token');
    }
    return this.lots.findOwned(user.sub, key);
  }

  /**
   * MKT-009 view counter: the atomic increment runs only when the
   * `lot_view_{code}` cookie is ABSENT (the cookie is then set for 30 min —
   * one counted view per code per visitor per 30 min). Fire-and-forget by
   * contract: LotsService.recordView swallows its own failures, so a counter
   * write can never fail the page render. Cookie is httpOnly + path-scoped to
   * this lot's URL so it is never replayed for other lots.
   *
   * Documented limitation: the cookie dedups DIRECT API visitors; the web RSC
   * hop is server-to-server (no browser cookies), so SSR loads count once per
   * render until the BFF forwards cookies (follow-up, PLAT phase).
   */
  private recordLotView(
    code: string,
    lotId: string,
    request: CookiesRequest,
    response: Response,
  ): void {
    const cookieName = lotViewCookieName(code);
    if (request.cookies?.[cookieName] !== undefined) {
      return;
    }
    response.cookie(cookieName, '1', {
      maxAge: LOT_VIEW_DEDUP_MINUTES * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      // Same production rule as the auth refresh cookie (auth.controller).
      secure: requireAppConfig(this.config).environment === 'production',
      path: `/lots/${code}`,
    });
    void this.lots.recordView(lotId);
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
