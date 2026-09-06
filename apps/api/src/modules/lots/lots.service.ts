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
import { AccountRole, LotStatus, type Lot, type Prisma, type User } from '@prisma/client';
import { findIranCity } from '../../common/constants/iran-geo';
import { CategoriesRepository } from '../categories/categories.repository';
import { UsersRepository } from '../users/users.repository';
import { LotsRepository } from './lots.repository';
import {
  LOT_CODE_MAX_CREATE_ATTEMPTS,
  LOT_DEFAULT_EXPIRY_DAYS,
  LOT_ERROR_CODES,
  LOT_MAX_TOTAL_PRICE,
  LOT_MIN_TOTAL_PRICE,
  LOT_TITLE_MAX_CODEPOINTS,
  LOT_TITLE_MIN_CODEPOINTS,
  generateLotCode,
} from './lots.constants';
import { toLotOwnerResponse, type LotOwnerResponseDto } from './dto/lot-response.dto';
import type { CreateLotDto } from './dto/create-lot.dto';
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
 * Lot business rules (LOT-002). Ownership is checked here (not the guard) so
 * the SELLER hat is asserted first (403 SELLER_REQUIRED before any probing),
 * then 404 for missing rows, then 403 for foreign lots — the card's order.
 * Create retries `generateLotCode()` on unique-violation (P2002) up to 3 times.
 */
@Injectable()
export class LotsService {
  private readonly logger = new Logger(LotsService.name);

  constructor(
    private readonly repository: LotsRepository,
    private readonly users: UsersRepository,
    private readonly categories: CategoriesRepository,
  ) {}

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

    // Code collision path: P2002 → fresh code → retry; 3 strikes = 500.
    for (let attempt = 1; attempt <= LOT_CODE_MAX_CREATE_ATTEMPTS; attempt++) {
      try {
        const created = await this.repository.create({ ...data, code: generateLotCode() });
        return toLotOwnerResponse(created);
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
      }
    }
    this.logger.error(`Lot code allocation failed after ${LOT_CODE_MAX_CREATE_ATTEMPTS} tries`);
    throw new InternalServerErrorException('Could not allocate a unique lot code');
  }

  /**
   * Owner-scoped partial edit per the status matrix in the file header.
   * Cross-field rules are checked against the RESULTING lot, mirroring the
   * profiles PATCH style (a rejected request must never leave partial state —
   * all validation happens before the single write).
   */
  async update(sellerId: string, id: string, dto: UpdateLotDto): Promise<LotOwnerResponseDto> {
    const user = await this.requireUser(sellerId);
    this.assertSeller(user);

    const lot = await this.repository.findById(id);
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }
    if (lot.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this lot');
    }

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

  private async updateListedLot(lot: Lot, dto: UpdateLotDto): Promise<LotOwnerResponseDto> {
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
    return toLotOwnerResponse(updated);
  }

  // --- DRAFT / REJECTED path: full content edit (+ resubmit) ---

  private async updateDraftLot(lot: Lot, dto: UpdateLotDto): Promise<LotOwnerResponseDto> {
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
    return toLotOwnerResponse(updated);
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
