import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountRole,
  LotStatus,
  MediaType,
  type Lot,
  type MediaAsset,
  type Prisma,
  type User,
} from '@prisma/client';
import { requireAppConfig } from '../../config/configuration';
import { findIranCity } from '../../common/constants/iran-geo';
import type { Paginated } from '../../common/dto/pagination-query.dto';
import { CategoriesRepository } from '../categories/categories.repository';
import { MediaRepository } from '../media/media.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersRepository } from '../users/users.repository';
import { LotsRepository, type LotWithMedia } from './lots.repository';
import {
  LOT_CODE_MAX_CREATE_ATTEMPTS,
  LOT_DEFAULT_EXPIRY_DAYS,
  LOT_ERROR_CODES,
  LOT_LISTED_WITHIN_DAYS,
  LOT_MAX_TOTAL_PRICE,
  LOT_MIN_TOTAL_PRICE,
  LOT_TITLE_MAX_CODEPOINTS,
  LOT_TITLE_MIN_CODEPOINTS,
  LOT_TRANSITIONS,
  SEARCH_QUERY_MIN_LENGTH,
  generateLotCode,
  normalizeFaQuery,
  type LotAction,
} from './lots.constants';
import { toLotOwnerResponse, type LotOwnerResponseDto } from './dto/lot-response.dto';
import { toLotCardResponse, type LotCardResponseDto } from './dto/lot-card.dto';
import { toLotPublicDetailResponse, type LotPublicDetailResponseDto } from './dto/lot-detail.dto';
import type { LotsPublicQueryDto } from './dto/lots-public-query.dto';
import type { PutLotMediaDto } from './dto/lot-media.dto';
import type { CreateLotDto } from './dto/create-lot.dto';
import type { MyLotsQueryDto } from './dto/my-lots-query.dto';
import type { UpdateLotDto } from './dto/update-lot.dto';

/**
 * LOT-002 edit rules, as a matrix (the card is authoritative):
 *
 * | current status              | allowed PATCH keys                                   | result                     |
 * |-----------------------------|------------------------------------------------------|----------------------------|
 * | DRAFT / REJECTED            | everything (full content edit)                       | stays; submit=true → PENDING_REVIEW (+ clears rejectionReason, refreshes expiresAt) |
 * | ACTIVE / PAUSED             | totalPrice, quantity, minOrderQuantity, availableQuantity only | revalidated + unitPrice re-derived, NO re-moderation; any other key → 409 ILLEGAL_STATUS_EDIT |
 * | PENDING_REVIEW / SOLD / EXPIRED / REMOVED | nothing (PATCH rejected)                 | 409 ILLEGAL_STATUS_EDIT    |
 *
 * The card's "content edit on ACTIVE returns the lot to PENDING_REVIEW" flow is
 * NOT exposed: the API refuses content edits while listed (409); the
 * resubmit-to-moderation path is editing in DRAFT/REJECTED + submit=true.
 */
const LISTED_CONTENT_LOCKED_KEYS = [
  'title',
  'description',
  'categoryId',
  'subcategoryId',
  'unit',
  'pricingType',
  'condition',
  'liquidationReason',
  'province',
  'city',
  'locationHint',
  'exactAddress',
  'submit',
] as const satisfies ReadonlyArray<keyof UpdateLotDto>;

/** Statuses whose rows are frozen for PATCH entirely (see matrix above). */
const NON_EDITABLE_STATUSES: readonly LotStatus[] = [
  LotStatus.PENDING_REVIEW,
  LotStatus.SOLD,
  LotStatus.EXPIRED,
  LotStatus.REMOVED,
];

/**
 * MEDIA-005 media edit rules — media is a CONTENT change (the gallery is
 * exactly what buyers see and what moderation reviews), so PUT /lots/:id/media
 * follows LOT-002's content-edit lock, stricter than the price/quantity
 * carve-out for listed lots:
 *
 * | status         | PUT /lots/:id/media | why                                            |
 * |----------------|---------------------|------------------------------------------------|
 * | DRAFT          | allowed             | normal composing                               |
 * | REJECTED       | allowed             | fix photos → resubmit                          |
 * | PENDING_REVIEW | 409                 | frozen under moderation (media IS the exhibit) |
 * | ACTIVE / PAUSED| 409                 | content is locked while listed (LOT-002)       |
 * | EXPIRED        | 409                 | duplicate to re-list instead                   |
 * | SOLD           | 409                 | transaction history stays as-sold              |
 * | REMOVED        | 409                 | soft-deleted                                   |
 */
const MEDIA_EDITABLE_STATUSES: readonly LotStatus[] = [LotStatus.DRAFT, LotStatus.REJECTED];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Visible-character length: counts Unicode CODE POINTS, not UTF-16 units —
 * the fa-aware title rule (Persian text is BMP so both agree; emoji don't). */
function codePointLength(value: string): number {
  return [...value].length;
}

/** Pricing convention (plan §4/§12): derived on every write, never accepted. */
function deriveUnitPrice(totalPrice: number, quantity: number): number {
  return Math.round(totalPrice / quantity);
}

/** +30d from now — set at create AND refreshed at every submit. */
function defaultExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + LOT_DEFAULT_EXPIRY_DAYS * DAY_MS);
}

/** Prisma unique-violation probe (works on real client errors and plain fakes). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Lot business rules. LOT-002 owns create/edit (status matrix below); LOT-003
 * adds the owner lifecycle actions driven by the LOT_TRANSITIONS table in
 * lots.constants.ts. Ownership is checked here (not the guard) so the SELLER
 * hat is asserted first (403 SELLER_REQUIRED before any probing), then 404
 * for missing rows, then 403 for foreign lots — the card's order.
 * Create/duplicate retry `generateLotCode()` on unique-violation (P2002) up
 * to 3 times.
 *
 * NOTE (AuditLog follow-up): lifecycle transitions are not recorded yet — the
 * AuditLog model does not exist (CAT-004 decision). See the LOT_TRANSITIONS
 * doc comment in lots.constants.ts.
 */
@Injectable()
export class LotsService {
  private readonly logger = new Logger(LotsService.name);

  constructor(
    private readonly repository: LotsRepository,
    private readonly users: UsersRepository,
    private readonly categories: CategoriesRepository,
    private readonly media: MediaRepository,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Owner mapper with gallery URLs resolved against PUBLIC_MEDIA_BASE_URL —
   * every owner endpoint returns the lot WITH its ordered media[] (MEDIA-005).
   */
  private toResponse(lot: LotWithMedia): LotOwnerResponseDto {
    return toLotOwnerResponse(lot, requireAppConfig(this.config).storage.publicMediaBaseUrl);
  }

  /**
   * Create a lot as the authenticated seller. `submit=false` (default) saves a
   * DRAFT, `submit=true` sends it straight to moderation (PENDING_REVIEW).
   * Drafts also get `expiresAt = +30d` so the findPublic safety filter
   * (expiresAt > now) and ending-soon sorting stay total across statuses.
   */
  async create(sellerId: string, dto: CreateLotDto): Promise<LotOwnerResponseDto> {
    const user = await this.requireUser(sellerId);
    this.assertSeller(user);

    await this.assertActiveCategory(dto.categoryId);
    await this.assertSubcategory(dto.subcategoryId ?? null, dto.categoryId);

    const title = dto.title.trim();
    this.assertTitle(title);
    const quantity = dto.quantity;
    const availableQuantity = dto.availableQuantity ?? quantity;
    const minOrderQuantity = dto.minOrderQuantity ?? 1;
    this.assertQuantityRules(quantity, minOrderQuantity, availableQuantity);
    this.assertTotalPrice(dto.totalPrice);
    this.assertValidLocation(dto.province, dto.city);

    const data: Omit<Prisma.LotUncheckedCreateInput, 'code'> = {
      sellerId,
      categoryId: dto.categoryId,
      subcategoryId: dto.subcategoryId ?? null,
      title,
      description: dto.description,
      quantity,
      unit: dto.unit ?? 'PIECE',
      availableQuantity,
      minOrderQuantity,
      pricingType: dto.pricingType,
      totalPrice: dto.totalPrice,
      unitPrice: deriveUnitPrice(dto.totalPrice, quantity),
      condition: dto.condition,
      liquidationReason: dto.liquidationReason,
      province: dto.province,
      city: dto.city,
      locationHint: dto.locationHint ?? null,
      exactAddress: dto.exactAddress ?? null,
      status: dto.submit === true ? LotStatus.PENDING_REVIEW : LotStatus.DRAFT,
      expiresAt: defaultExpiry(),
    };

    return this.toResponse(await this.createWithFreshCode(data));
  }

  /**
   * Owner-scoped partial edit per the status matrix in the file header.
   * Cross-field rules are checked against the RESULTING lot, mirroring the
   * profiles PATCH style (a rejected request must never leave partial state —
   * all validation happens before the single write).
   */
  async update(sellerId: string, id: string, dto: UpdateLotDto): Promise<LotOwnerResponseDto> {
    const lot = await this.requireOwnedLot(sellerId, id);

    if ((NON_EDITABLE_STATUSES as readonly string[]).includes(lot.status)) {
      throw this.illegalStatusEdit(
        lot.status === LotStatus.PENDING_REVIEW
          ? 'This lot is under moderation and cannot be edited right now'
          : `Lots in status ${lot.status} cannot be edited`,
      );
    }
    return lot.status === LotStatus.ACTIVE || lot.status === LotStatus.PAUSED
      ? this.updateListedLot(lot, dto)
      : this.updateDraftLot(lot, dto);
  }

  // --- ACTIVE / PAUSED path: the restricted price/quantity subset ---

  private async updateListedLot(
    lot: LotWithMedia,
    dto: UpdateLotDto,
  ): Promise<LotOwnerResponseDto> {
    const attempted = LISTED_CONTENT_LOCKED_KEYS.some((key) => dto[key] !== undefined);
    if (attempted) {
      throw this.illegalStatusEdit(
        'Only totalPrice, quantity, minOrderQuantity and availableQuantity can be edited while the lot is active or paused',
      );
    }

    const quantity = dto.quantity ?? lot.quantity;
    const minOrderQuantity = dto.minOrderQuantity ?? lot.minOrderQuantity;
    const availableQuantity = dto.availableQuantity ?? lot.availableQuantity;
    const totalPrice = dto.totalPrice ?? lot.totalPrice;
    this.assertQuantityRules(quantity, minOrderQuantity, availableQuantity);
    this.assertTotalPrice(totalPrice);

    const data: Prisma.LotUncheckedUpdateInput = {
      ...(dto.quantity !== undefined ? { quantity } : {}),
      ...(dto.minOrderQuantity !== undefined ? { minOrderQuantity } : {}),
      ...(dto.availableQuantity !== undefined ? { availableQuantity } : {}),
      // Price OR quantity moved ⇒ unitPrice re-derived; no re-moderation.
      ...(dto.totalPrice !== undefined || dto.quantity !== undefined
        ? { totalPrice, unitPrice: deriveUnitPrice(totalPrice, quantity) }
        : {}),
    };
    const updated = Object.keys(data).length > 0 ? await this.repository.update(lot.id, data) : lot;

    // NTF-001 hook point: notify savers when the listed price actually changes.
    this.onLotPriceChanged(lot, updated);
    return this.toResponse(updated);
  }

  // --- DRAFT / REJECTED path: full content edit (+ resubmit) ---

  private async updateDraftLot(lot: LotWithMedia, dto: UpdateLotDto): Promise<LotOwnerResponseDto> {
    const submit = dto.submit === true;

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      this.assertTitle(title);
    }
    const resultingCategoryId = dto.categoryId ?? lot.categoryId;
    if (dto.categoryId !== undefined) {
      await this.assertActiveCategory(dto.categoryId);
    }
    // Resulting-pair rule: the sub must stay a child of the RESULTING category,
    // so changing the category alone is rejected while the old sub hangs on
    // (clear it with subcategoryId: null or send the new one together).
    const resultingSubcategoryId =
      dto.subcategoryId === undefined ? lot.subcategoryId : dto.subcategoryId;
    if (resultingSubcategoryId != null) {
      await this.assertSubcategory(resultingSubcategoryId, resultingCategoryId);
    }

    const quantity = dto.quantity ?? lot.quantity;
    const minOrderQuantity = dto.minOrderQuantity ?? lot.minOrderQuantity;
    const availableQuantity = dto.availableQuantity ?? lot.availableQuantity;
    this.assertQuantityRules(quantity, minOrderQuantity, availableQuantity);
    const totalPrice = dto.totalPrice ?? lot.totalPrice;
    this.assertTotalPrice(totalPrice);

    // Geo pair on the RESULTING location (either half may arrive alone).
    this.assertValidLocation(dto.province ?? lot.province, dto.city ?? lot.city);

    const data: Prisma.LotUncheckedUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.subcategoryId !== undefined ? { subcategoryId: dto.subcategoryId } : {}),
      ...(dto.quantity !== undefined ? { quantity } : {}),
      ...(dto.minOrderQuantity !== undefined ? { minOrderQuantity } : {}),
      ...(dto.availableQuantity !== undefined ? { availableQuantity } : {}),
      ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
      ...(dto.pricingType !== undefined ? { pricingType: dto.pricingType } : {}),
      ...(dto.condition !== undefined ? { condition: dto.condition } : {}),
      ...(dto.liquidationReason !== undefined ? { liquidationReason: dto.liquidationReason } : {}),
      ...(dto.province !== undefined ? { province: dto.province } : {}),
      ...(dto.city !== undefined ? { city: dto.city } : {}),
      ...(dto.locationHint !== undefined ? { locationHint: dto.locationHint } : {}),
      ...(dto.exactAddress !== undefined ? { exactAddress: dto.exactAddress } : {}),
      ...(dto.totalPrice !== undefined || dto.quantity !== undefined
        ? { totalPrice, unitPrice: deriveUnitPrice(totalPrice, quantity) }
        : {}),
      ...(submit
        ? {
            status: LotStatus.PENDING_REVIEW,
            expiresAt: defaultExpiry(),
            // Resubmission of a rejected lot clears the old verdict (owner-only field).
            ...(lot.status === LotStatus.REJECTED ? { rejectionReason: null } : {}),
          }
        : {}),
    };
    const updated = Object.keys(data).length > 0 ? await this.repository.update(lot.id, data) : lot;
    return this.toResponse(updated);
  }

  // --- lifecycle actions (LOT-003): table-driven via LOT_TRANSITIONS ---

  /**
   * DRAFT/REJECTED → PENDING_REVIEW: refreshes expiresAt (+30d) and clears
   * rejectionReason on REJECTED. Delegates the WRITE to the same code path as
   * PATCH submit:true (updateDraftLot) so the two entry points cannot drift;
   * the transition-table check runs first so illegal statuses answer 409
   * ILLEGAL_TRANSITION (PATCH's own 409 keeps ILLEGAL_STATUS_EDIT).
   */
  async submit(sellerId: string, id: string): Promise<LotOwnerResponseDto> {
    const lot = await this.requireOwnedLot(sellerId, id);
    this.assertTransition(lot.status, 'submit');
    return this.updateDraftLot(lot, { submit: true });
  }

  /** ACTIVE → PAUSED (listing hidden from findPublic; no other field moves). */
  async pause(sellerId: string, id: string): Promise<LotOwnerResponseDto> {
    const lot = await this.requireOwnedLot(sellerId, id);
    this.assertTransition(lot.status, 'pause');
    return this.toResponse(await this.repository.update(lot.id, { status: LotStatus.PAUSED }));
  }

  /**
   * PAUSED → ACTIVE, respecting expiry: a paused lot whose expiresAt already
   * passed cannot resume (409 EXPIRED) — findPublic would hide it again and
   * the LOT-006 sweep would only flip it later; duplicate is the re-list path.
   */
  async resume(sellerId: string, id: string): Promise<LotOwnerResponseDto> {
    const lot = await this.requireOwnedLot(sellerId, id);
    this.assertTransition(lot.status, 'resume');
    if (lot.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException({
        code: LOT_ERROR_CODES.EXPIRED,
        message: 'This lot has expired while paused and cannot be resumed — duplicate it instead',
      });
    }
    return this.toResponse(await this.repository.update(lot.id, { status: LotStatus.ACTIVE }));
  }

  /** ACTIVE/PAUSED → SOLD: stamps soldAt=now and zeroes availableQuantity. */
  async markSold(sellerId: string, id: string): Promise<LotOwnerResponseDto> {
    const lot = await this.requireOwnedLot(sellerId, id);
    this.assertTransition(lot.status, 'mark-sold');
    return this.toResponse(
      await this.repository.update(lot.id, {
        status: LotStatus.SOLD,
        soldAt: new Date(),
        availableQuantity: 0,
      }),
    );
  }

  /**
   * Copy any non-REMOVED lot to a NEW DRAFT (documented semantics):
   * - Seller-owned CONTENT fields are copied verbatim: title (kept identical —
   *   no «(کپی)» suffix; it must stay ≤ 120 code points and appending could
   *   overflow, so the copy shares the source title), description, category +
   *   sub, quantity/minOrder/available as-is, pricing (unitPrice re-derived on
   *   write), condition/reason, province/city, locationHint, exactAddress
   *   (private owner field on a row owned by the same seller).
   * - RESET: status DRAFT, fresh code (P2002 retry), fresh expiresAt +30d,
   *   counters 0, soldAt/publishedAt/rejectionReason null — and featuredAt
   *   null (merchandising state is per-row, never inherited).
   * - MEDIA: lot_media links are NOT copied (MEDIA-005 owns media; a copy
   *   starts unillustrated like any fresh draft).
   * - Category rows are not re-validated: ids are copied as-is; the draft is
   *   fully editable and moderation sees it before publish anyway.
   */
  async duplicate(sellerId: string, id: string): Promise<LotOwnerResponseDto> {
    const lot = await this.requireOwnedLot(sellerId, id);
    this.assertTransition(lot.status, 'duplicate');

    const data: Omit<Prisma.LotUncheckedCreateInput, 'code'> = {
      sellerId: lot.sellerId,
      categoryId: lot.categoryId,
      subcategoryId: lot.subcategoryId,
      title: lot.title,
      description: lot.description,
      quantity: lot.quantity,
      unit: lot.unit,
      availableQuantity: lot.availableQuantity,
      minOrderQuantity: lot.minOrderQuantity,
      pricingType: lot.pricingType,
      totalPrice: lot.totalPrice,
      unitPrice: deriveUnitPrice(lot.totalPrice, lot.quantity),
      condition: lot.condition,
      liquidationReason: lot.liquidationReason,
      province: lot.province,
      city: lot.city,
      locationHint: lot.locationHint,
      exactAddress: lot.exactAddress,
      status: LotStatus.DRAFT,
      expiresAt: defaultExpiry(),
    };
    return this.toResponse(await this.createWithFreshCode(data));
  }

  /**
   * Soft delete: any non-SOLD, non-REMOVED status → REMOVED + deletedAt=now.
   * SOLD is terminal (409 — revenue history must not be scrubbed); an already
   * REMOVED lot is a 409 too (re-deleting a removed row is a conflict, not an
   * idempotent refresh of deletedAt). The owner shape still resolves via
   * findById for the seller afterwards — visibility filtering happens in the
   * listing queries, not by hiding the row.
   */
  async remove(sellerId: string, id: string): Promise<LotOwnerResponseDto> {
    const lot = await this.requireOwnedLot(sellerId, id);
    this.assertTransition(lot.status, 'delete');
    return this.toResponse(
      await this.repository.update(lot.id, {
        status: LotStatus.REMOVED,
        deletedAt: new Date(),
      }),
    );
  }

  // --- public reads (MKT-001: the marketplace listing) ---

  /**
   * Public lot listing (GET /lots, MKT-001 + MKT-002 + MKT-003): ACTIVE-only,
   * sorted against the LOT_CARD_SORTS allowlist (the DTO 400s anything else),
   * filtered by the MKT-002 buyer filters (the DTO validates each param; this
   * boundary only RENAMES the wire params onto the repository filter shape —
   * no business rule lives here), Paginated envelope of CARD shapes.
   * Anonymous by contract (@Public) — no user lookup, no seller hat. Rows
   * arrive with the card include (seller summary + cover link, one query set)
   * and map through the strict allowlist mapper; the cover URL is resolved
   * against PUBLIC_MEDIA_BASE_URL at this boundary. Param → filter notes:
   * priceMin/priceMax are the unitPrice bounds (the derived comparison price),
   * qtyMin/qtyMax the quantity bounds, listedWithin token → days via
   * LOT_LISTED_WITHIN_DAYS. `verifiedSeller` has no mapping yet — deferred to
   * TRS-001 (documented on the DTO).
   *
   * MKT-003 `q`: the ONLY business rule on this endpoint — the card's minimum
   * length 2 (code points, trimmed — the DTO already trimmed), plus a
   * normalized-empty guard (a query of only normalizing characters, e.g. two
   * ZWNJs, would degenerate to match-all). Both 400 with the machine code
   * SEARCH_QUERY_TOO_SHORT; the card's fa copy «جستجو حداقل ۲ کاراکتر» is
   * web-side. The raw q is passed through — the repository owns normalization
   * + matching (one normalizer on the data-access side).
   */
  async findPublic(query: LotsPublicQueryDto): Promise<Paginated<LotCardResponseDto>> {
    if (query.q !== undefined) {
      const normalized = normalizeFaQuery(query.q);
      if ([...query.q].length < SEARCH_QUERY_MIN_LENGTH || normalized.length === 0) {
        throw new BadRequestException({
          code: LOT_ERROR_CODES.SEARCH_QUERY_TOO_SHORT,
          message: `q must be at least ${SEARCH_QUERY_MIN_LENGTH} searchable characters`,
        });
      }
    }
    const { items, total, page, limit } = await this.repository.findPublic({
      filters: {
        categoryId: query.categoryId,
        subcategoryId: query.subcategoryId,
        city: query.city,
        province: query.province,
        pricingType: query.pricingType,
        condition: query.condition,
        liquidationReason: query.liquidationReason,
        unitPriceMin: query.priceMin,
        unitPriceMax: query.priceMax,
        quantityMin: query.qtyMin,
        quantityMax: query.qtyMax,
        listedWithinDays:
          query.listedWithin !== undefined ? LOT_LISTED_WITHIN_DAYS[query.listedWithin] : undefined,
        query: query.q,
      },
      sort: query.sort,
      page: query.page,
      limit: query.limit,
    });
    const mediaBaseUrl = requireAppConfig(this.config).storage.publicMediaBaseUrl;
    return { items: items.map((lot) => toLotCardResponse(lot, mediaBaseUrl)), total, page, limit };
  }

  /**
   * Public lot detail (GET /lots/:code, MKT-009): the full public spec of ONE
   * ACTIVE lot addressed by its public `code` (never the internal id), plus
   * the similar-lots slice. Visibility is exactly the findPublic core —
   * ACTIVE + expiresAt > now + deletedAt null — and any miss (unknown code,
   * DRAFT/PAUSED/PENDING_REVIEW/EXPIRED/REMOVED/SOLD, past expiry) answers a
   * uniform 404: the public view has no oracle for why a lot is gone (owners
   * use the untouched GET /lots/:id owner route; validation note on the card).
   * Payload = strict LotPublicDetailResponseDto allowlist (no exactAddress /
   * rejectionReason / seller contact; viewCount is not rendered by the page
   * and stays out of the payload).
   */
  async findPublicByCode(code: string): Promise<LotPublicDetailResponseDto> {
    const lot = await this.repository.findByCode(code);
    if (
      !lot ||
      lot.status !== LotStatus.ACTIVE ||
      lot.deletedAt !== null ||
      lot.expiresAt.getTime() <= Date.now()
    ) {
      throw new NotFoundException('Lot not found');
    }
    const mediaBaseUrl = requireAppConfig(this.config).storage.publicMediaBaseUrl;
    const similar = await this.repository.findSimilar(lot);
    return {
      ...toLotPublicDetailResponse(lot, mediaBaseUrl),
      similar: similar.map((row) => toLotCardResponse(row, mediaBaseUrl)),
    };
  }

  /**
   * MKT-009 view counter — one atomic updateMany increment ({increment},
   * plan §12: never read-modify-write). The controller calls this
   * FIRE-AND-FORGET after the dedup cookie check; every failure is swallowed
   * here (logged) so a counter write can NEVER fail the page render.
   */
  async recordView(lotId: string): Promise<void> {
    try {
      await this.repository.incrementCounters(lotId, { viewCount: 1 });
    } catch (error) {
      this.logger.warn(`viewCount increment failed for lot ${lotId}: ${String(error)}`);
    }
  }

  // --- owner reads (LOT-005: seller inventory + the edit-flow load step) ---
  /**
   * Seller inventory (GET /lots/mine, LOT-005): every NON-REMOVED lot the
   * caller owns, newest first, one optional status filter (the dashboard
   * tabs), Paginated envelope of OWNER shapes (media[] per row). The SELLER
   * hat is asserted like every other owner route (403 SELLER_REQUIRED first —
   * the same order requireOwnedLot uses for single-lot actions).
   */
  async findMine(sellerId: string, query: MyLotsQueryDto): Promise<Paginated<LotOwnerResponseDto>> {
    const user = await this.requireUser(sellerId);
    this.assertSeller(user);
    const { items, total, page, limit } = await this.repository.findMine(sellerId, {
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
    return { items: items.map((lot) => this.toResponse(lot)), total, page, limit };
  }

  /**
   * Owner-scoped single read (GET /lots/:id, LOT-005) — closes the LOT-004
   * edit-load gap (the wizard's useLot already calls it through the BFF).
   * requireOwnedLot = authenticated (401) → SELLER hat (403 SELLER_REQUIRED)
   * → 404 missing → 403 foreign. REMOVED stays resolvable per LOT-003
   * semantics: the soft-deleted row is hidden from listings, not erased for
   * its owner.
   */
  async findOwned(sellerId: string, id: string): Promise<LotOwnerResponseDto> {
    const lot = await this.requireOwnedLot(sellerId, id);
    return this.toResponse(lot);
  }

  // --- gallery replace (MEDIA-005) ---

  /**
   * Replace the lot's whole gallery (PUT semantics — the payload IS the
   * gallery). Contract decisions, documented:
   *
   * - ERROR CODES: a payload mediaAssetId that does not exist OR belongs to
   *   another user is a uniform 403 MEDIA_NOT_OWNED — asset ids are unguessable
   *   random strings, so there is no probing concern to answer with 404, and a
   *   single batch error beats "which of the 18 items?" ambiguity.
   * - CAPS: per KIND, derived from the MediaAsset.type column (the client
   *   never declares kind): ≤ uploads.maxLotImages (15) images and ≤
   *   uploads.maxLotVideos (3) videos — exceedance is 409 MEDIA_CAP_EXCEEDED
   *   with the counts in the message (the card's contract).
   * - COVER: `coverIndex` (default 0) marks the single cover; it must be
   *   within bounds (400 COVER_INDEX_OUT_OF_BOUNDS otherwise, including a
   *   coverIndex on an empty gallery). Exactly one cover is a server
   *   invariant — every written row gets an explicit isCover.
   * - REPLACE SEMANTICS: one transaction — links missing from the payload are
   *   deleted, kept links are updated IN PLACE (row id/createdAt preserved),
   *   new links created. Orphan file cleanup for removed links is deferred to
   *   a P1 job (card) — the MediaAsset rows and their bytes are untouched.
   * - STATUS: media is a content change → allowed on DRAFT/REJECTED only,
   *   409 ILLEGAL_STATUS_EDIT otherwise (matrix on MEDIA_EDITABLE_STATUSES).
   */
  async putMedia(sellerId: string, id: string, dto: PutLotMediaDto): Promise<LotOwnerResponseDto> {
    const lot = await this.requireOwnedLot(sellerId, id);
    this.assertMediaEditable(lot.status);

    const assetIds = dto.items.map((item) => item.mediaAssetId);
    this.assertNoDuplicateAssets(assetIds);

    // Existence + ownership in one read; kind comes from the asset row.
    const assets = await this.media.findManyByIds(assetIds);
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    for (const assetId of assetIds) {
      const asset = assetsById.get(assetId);
      if (!asset || asset.ownerId !== sellerId) {
        throw new ForbiddenException({
          code: LOT_ERROR_CODES.MEDIA_NOT_OWNED,
          message: 'The media list references an asset that does not exist or is not yours',
        });
      }
    }
    this.assertMediaKindCaps(assetsById);

    const coverIndex = dto.coverIndex ?? 0;
    if ((dto.coverIndex !== undefined || dto.items.length > 0) && coverIndex >= dto.items.length) {
      throw new BadRequestException({
        code: LOT_ERROR_CODES.COVER_INDEX_OUT_OF_BOUNDS,
        message: `coverIndex ${coverIndex} is out of bounds for a gallery of ${dto.items.length}`,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.repository.deleteMediaNotIn(lot.id, assetIds, tx);
      for (const [sortOrder, mediaAssetId] of assetIds.entries()) {
        await this.repository.upsertMedia(
          lot.id,
          { mediaAssetId, sortOrder, isCover: sortOrder === coverIndex },
          tx,
        );
      }
      // Fresh read INSIDE the tx — the gallery include feeds the response.
      return this.repository.findById(lot.id, tx);
    });
    if (!updated) {
      // Unreachable: the lot row was locked in by requireOwnedLot above.
      throw new NotFoundException('Lot not found');
    }
    return this.toResponse(updated);
  }

  /** See MEDIA_EDITABLE_STATUSES — media follows the content-edit lock. */
  private assertMediaEditable(status: LotStatus): void {
    if (!MEDIA_EDITABLE_STATUSES.includes(status)) {
      throw this.illegalStatusEdit(
        'Media can only be changed while the lot is in DRAFT or REJECTED status',
      );
    }
  }

  private assertNoDuplicateAssets(assetIds: readonly string[]): void {
    if (new Set(assetIds).size !== assetIds.length) {
      throw new BadRequestException({
        code: LOT_ERROR_CODES.MEDIA_DUPLICATED,
        message: 'The same mediaAssetId appears more than once in items',
      });
    }
  }

  /** Per-kind caps (kind = MediaAsset.type), counts included in the message. */
  private assertMediaKindCaps(assetsById: Map<string, MediaAsset>): void {
    const config = requireAppConfig(this.config);
    let images = 0;
    let videos = 0;
    for (const asset of assetsById.values()) {
      if (asset.type === MediaType.IMAGE) {
        images += 1;
      } else {
        videos += 1;
      }
    }
    if (images > config.uploads.maxLotImages) {
      throw new ConflictException({
        code: LOT_ERROR_CODES.MEDIA_CAP_EXCEEDED,
        message: `Too many images: ${images} uploaded, ${config.uploads.maxLotImages} allowed per lot`,
      });
    }
    if (videos > config.uploads.maxLotVideos) {
      throw new ConflictException({
        code: LOT_ERROR_CODES.MEDIA_CAP_EXCEEDED,
        message: `Too many videos: ${videos} uploaded, ${config.uploads.maxLotVideos} allowed per lot`,
      });
    }
  }

  // --- action guards ---

  /**
   * The shared owner-action precondition chain, in the card's order:
   * authenticated (401) → SELLER hat (403 SELLER_REQUIRED) → row exists (404)
   * → owned by the caller (403). Every lifecycle action starts here.
   */
  private async requireOwnedLot(sellerId: string, id: string): Promise<LotWithMedia> {
    const user = await this.requireUser(sellerId);
    this.assertSeller(user);

    const lot = await this.repository.findById(id);
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }
    if (lot.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this lot');
    }
    return lot;
  }

  /** Table lookup — a missing (status, action) entry is an illegal move. */
  private assertTransition(status: LotStatus, action: LotAction): void {
    if (LOT_TRANSITIONS[status][action] === undefined) {
      throw new ConflictException({
        code: LOT_ERROR_CODES.ILLEGAL_TRANSITION,
        message: `Action "${action}" is not allowed for a lot in status ${status}`,
      });
    }
  }

  /** Code collision path (create + duplicate): P2002 → fresh code → retry. */
  private async createWithFreshCode(
    data: Omit<Prisma.LotUncheckedCreateInput, 'code'>,
  ): Promise<LotWithMedia> {
    for (let attempt = 1; attempt <= LOT_CODE_MAX_CREATE_ATTEMPTS; attempt++) {
      try {
        return await this.repository.create({ ...data, code: generateLotCode() });
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
      }
    }
    this.logger.error(`Lot code allocation failed after ${LOT_CODE_MAX_CREATE_ATTEMPTS} tries`);
    throw new InternalServerErrorException('Could not allocate a unique lot code');
  }

  // --- validation helpers (shared by create + both edit paths) ---

  private async requireUser(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return user;
  }

  /** Authenticated AND holding the SELLER hat — else 403 + SELLER_REQUIRED code. */
  private assertSeller(user: User): void {
    if (!user.accountRoles.includes(AccountRole.SELLER)) {
      throw new ForbiddenException({
        code: LOT_ERROR_CODES.SELLER_REQUIRED,
        message: 'Only seller accounts can create or edit lots',
      });
    }
  }

  private assertTitle(title: string): void {
    const length = codePointLength(title);
    if (length < LOT_TITLE_MIN_CODEPOINTS || length > LOT_TITLE_MAX_CODEPOINTS) {
      throw new BadRequestException(
        `title must be between ${LOT_TITLE_MIN_CODEPOINTS} and ${LOT_TITLE_MAX_CODEPOINTS} characters`,
      );
    }
  }

  /** Category must exist AND be active (deactivated rows are historical only). */
  private async assertActiveCategory(categoryId: string): Promise<void> {
    const category = await this.categories.findById(categoryId);
    if (!category || !category.isActive) {
      throw new BadRequestException('categoryId must reference an existing, active category');
    }
  }

  /** Optional sub must exist and be a DIRECT CHILD of the resulting category. */
  private async assertSubcategory(subcategoryId: string | null, categoryId: string): Promise<void> {
    if (subcategoryId == null) {
      return;
    }
    const subcategory = await this.categories.findById(subcategoryId);
    if (!subcategory) {
      throw new BadRequestException('subcategoryId does not exist');
    }
    if (subcategory.parentId !== categoryId) {
      throw new BadRequestException('subcategoryId must be a direct child of categoryId');
    }
  }

  private assertQuantityRules(
    quantity: number,
    minOrderQuantity: number,
    availableQuantity: number,
  ): void {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('quantity must be an integer of at least 1');
    }
    if (
      !Number.isInteger(minOrderQuantity) ||
      minOrderQuantity < 1 ||
      minOrderQuantity > quantity
    ) {
      throw new BadRequestException('minOrderQuantity must be between 1 and quantity');
    }
    if (
      !Number.isInteger(availableQuantity) ||
      availableQuantity < 0 ||
      availableQuantity > quantity
    ) {
      throw new BadRequestException('availableQuantity must be between 0 and quantity');
    }
  }

  private assertTotalPrice(totalPrice: number): void {
    if (
      !Number.isInteger(totalPrice) ||
      totalPrice < LOT_MIN_TOTAL_PRICE ||
      totalPrice > LOT_MAX_TOTAL_PRICE
    ) {
      throw new BadRequestException(
        `totalPrice must be a whole Toman amount between ${LOT_MIN_TOTAL_PRICE} and ${LOT_MAX_TOTAL_PRICE}`,
      );
    }
  }

  /** Same pair rule as profiles: city must belong to province on the geo list. */
  private assertValidLocation(province: string, city: string): void {
    if (!findIranCity(province, city)) {
      throw new BadRequestException(`city "${city}" does not exist in province "${province}"`);
    }
  }

  private illegalStatusEdit(message: string): ConflictException {
    return new ConflictException({
      code: LOT_ERROR_CODES.ILLEGAL_STATUS_EDIT,
      message,
    });
  }

  /**
   * LOT_PRICE_CHANGED hook point — intentionally a NO-OP until the
   * notifications phase (NTF-001) subscribes savers/buyers. Kept as a named
   * private method so the consumption site already exists; deliberately no
   * event-emitter infrastructure (card scope).
   */
  private onLotPriceChanged(previous: Lot, updated: Lot): void {
    if (previous.totalPrice !== updated.totalPrice) {
      // NTF-001 will enqueue LOT_PRICE_CHANGED notifications here.
    }
  }
}
