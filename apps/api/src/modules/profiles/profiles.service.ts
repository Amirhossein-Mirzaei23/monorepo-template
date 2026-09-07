import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountRole, LotStatus, UserStatus } from '@prisma/client';
import { requireAppConfig } from '../../config/configuration';
import { findIranCity } from '../../common/constants/iran-geo';
import type { Paginated } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesRepository } from '../categories/categories.repository';
import { UsersRepository } from '../users/users.repository';
import { LotsRepository, type LotCardRepositoryRow } from '../lots/lots.repository';
import { toLotCardResponse, type LotCardResponseDto } from '../lots/dto/lot-card.dto';
import { toPublicSellerSummary, type PublicSellerListDto } from './dto/public-seller.dto';
import type { ListSellersQueryDto } from './dto/list-sellers-query.dto';
import {
  SELLER_PROFILE_ACTIVE_LIMIT,
  SELLER_PROFILE_SOLD_LIMIT,
  SellerPublicCategoryDto,
  toPublicSellerProfile,
  type PublicSellerProfileDto,
} from './dto/public-seller-profile.dto';
import { toProfileResponse, type ProfileResponseDto } from './dto/profile-response.dto';
import type { SaveOnboardingDto } from './dto/save-onboarding.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfilesRepository, type Tx, type UpdateProfileData } from './profiles.repository';

/** Roles are never removed from an account — history must survive (PROF-001). */
const ROLE_REMOVAL_MESSAGE =
  'Account roles are never removed (history is preserved) — re-submit onboarding to change hats';

/**
 * Onboarding business rules (ONB-001). `submitOnboarding` is ONE transaction:
 * profile upsert → interest-set replacement → User.accountRoles sync +
 * first-completion onboardingCompletedAt stamp. Re-submitting is the intended
 * edit path (idempotent update — never 409); PATCH /profiles/me is PROF-001.
 */
@Injectable()
export class ProfilesService {
  constructor(
    private readonly repository: ProfilesRepository,
    private readonly users: UsersRepository,
    private readonly categories: CategoriesRepository,
    private readonly prisma: PrismaService,
    private readonly lots: LotsRepository,
    private readonly config: ConfigService,
  ) {}

  async submitOnboarding(userId: string, dto: SaveOnboardingDto): Promise<ProfileResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.users.findById(userId, tx);
      if (!user) {
        throw new UnauthorizedException('User no longer exists');
      }

      // Cross-field rules the DTO cannot express (single source: here).
      this.assertRoles(dto);
      this.assertSellerFields(dto);
      this.assertValidLocation(dto.province ?? null, dto.city ?? null);
      const interestIds = await this.resolveInterestIds(dto.interests ?? [], tx);

      const profile = await this.repository.upsert(
        userId,
        {
          displayName: dto.displayName,
          businessName: dto.businessName ?? null,
          province: dto.province ?? null,
          city: dto.city ?? null,
          bio: dto.bio ?? null,
          instagram: dto.instagram ?? null,
          website: dto.website ?? null,
          isBuyer: dto.isBuyer,
          isSeller: dto.isSeller,
          sellerYearsActive: dto.sellerYearsActive ?? null,
          sellerBusinessType: dto.sellerBusinessType ?? null,
          sellerDescription: dto.sellerDescription ?? null,
        },
        tx,
      );
      await this.repository.replaceInterests(profile.id, interestIds, tx);
      const updatedUser = await this.users.updateOnboarding(
        userId,
        {
          accountRoles: accountRolesOf(dto),
          // First completion only — the original date survives re-onboarding.
          onboardingCompletedAt: user.onboardingCompletedAt ?? new Date(),
        },
        tx,
      );

      const saved = await this.repository.findByUserId(userId, tx);
      if (!saved) {
        throw new Error('Profile missing right after upsert — invariant violation');
      }
      return toProfileResponse(saved, updatedUser);
    });
  }

  /** Full own profile; users without a profile row have not onboarded yet. */
  async getMyProfile(userId: string): Promise<ProfileResponseDto> {
    const [user, profile] = await Promise.all([
      this.users.findById(userId),
      this.repository.findByUserId(userId),
    ]);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    if (!profile) {
      throw new NotFoundException('Profile not found — complete onboarding first');
    }
    return toProfileResponse(profile, user);
  }

  /**
   * Partial update of the own profile (PROF-001): absent keys are untouched,
   * explicit `null` clears optional fields, cross-field rules are checked
   * against the RESULTING profile. Role flags are ADD-ONLY — the card: "role
   * changes allowed — adds accountRole, never removes history" — so granting a
   * hat syncs User.accountRoles, while any removal attempt is a 400 (this also
   * protects the last role by construction: nothing can ever be removed).
   */
  async updateMyProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.users.findById(userId, tx);
      if (!user) {
        throw new UnauthorizedException('User no longer exists');
      }
      const existing = await this.repository.findByUserId(userId, tx);
      if (!existing) {
        throw new NotFoundException('Profile not found — complete onboarding first');
      }
      if (dto.displayName === null) {
        throw new BadRequestException('displayName cannot be cleared');
      }

      // --- roles: additions only, removals rejected ---
      if (dto.isBuyer === false && existing.isBuyer) {
        throw new BadRequestException(ROLE_REMOVAL_MESSAGE);
      }
      if (dto.isSeller === false && existing.isSeller) {
        throw new BadRequestException(ROLE_REMOVAL_MESSAGE);
      }
      const isBuyer = existing.isBuyer || dto.isBuyer === true;
      const isSeller = existing.isSeller || dto.isSeller === true;

      // --- required-if-seller on the RESULTING businessName ---
      const businessName =
        dto.businessName === undefined
          ? existing.businessName
          : normalizeOptionalText(dto.businessName);
      if (isSeller && (businessName == null || businessName.trim().length === 0)) {
        throw new BadRequestException('businessName is required for sellers');
      }

      // --- geo pair check on the RESULTING location ---
      const province = dto.province === undefined ? existing.province : dto.province;
      const city = dto.city === undefined ? existing.city : dto.city;
      this.assertValidLocation(province, city);

      const data: UpdateProfileData = {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.businessName !== undefined ? { businessName } : {}),
        ...(dto.province !== undefined ? { province } : {}),
        ...(dto.city !== undefined ? { city } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.instagram !== undefined ? { instagram: dto.instagram } : {}),
        ...(dto.website !== undefined ? { website: dto.website } : {}),
        ...(isBuyer !== existing.isBuyer ? { isBuyer } : {}),
        ...(isSeller !== existing.isSeller ? { isSeller } : {}),
        ...(dto.sellerYearsActive !== undefined
          ? { sellerYearsActive: dto.sellerYearsActive }
          : {}),
        ...(dto.sellerBusinessType !== undefined
          ? { sellerBusinessType: dto.sellerBusinessType }
          : {}),
        ...(dto.sellerDescription !== undefined
          ? { sellerDescription: dto.sellerDescription }
          : {}),
      };
      // All validation (incl. interests) completes BEFORE the first write so a
      // rejected PATCH can never leave partial state behind.
      const interestIds =
        dto.interests !== undefined ? await this.resolveInterestIds(dto.interests ?? [], tx) : null;

      if (Object.keys(data).length > 0) {
        await this.repository.updateByUserId(userId, data, tx);
      }
      if (interestIds !== null) {
        await this.repository.replaceInterests(existing.id, interestIds, tx);
      }

      // User.accountRoles mirrors the profile hats — synced, never shrunk here.
      let userAfter = user;
      const nextRoles = accountRolesFromFlags(isBuyer, isSeller);
      if (!rolesEqual(user.accountRoles, nextRoles)) {
        userAfter = await this.users.update(userId, { accountRoles: nextRoles }, tx);
      }

      const saved = await this.repository.findByUserId(userId, tx);
      if (!saved) {
        throw new Error('Profile missing right after update — invariant violation');
      }
      return toProfileResponse(saved, userAfter);
    });
  }

  /**
   * MKT-004 — public sellers listing for the home «تأییدشده‌ها» strip
   * (GET /profiles/sellers, @Public). Newest seller profiles, plain
   * { items } envelope — no pagination (the DTO doc explains the cap).
   *
   * TRS-001 placeholder: no profile is verified today (the mapper sends a
   * hard-coded false), so a `verified=true` request filters to an EMPTY list
   * and the home strip stays hidden until real verification exists — instead
   * of presenting unverified sellers as trusted.
   */
  async findPublicSellers(query: ListSellersQueryDto): Promise<PublicSellerListDto> {
    const profiles = await this.repository.findSellerProfiles(query.limit);
    const items = profiles.map(toPublicSellerSummary);
    return { items: query.verified === true ? items.filter((seller) => seller.verified) : items };
  }

  /**
   * PROF-002 — the public seller profile page payload (GET /profiles/sellers/:id,
   * @Public). The route param is the PROFILE id (the MKT-004 strip's id space).
   *
   * Validation is one UNIFORM 404 with no oracle (the public view must not
   * reveal why a seller page is gone): unknown profile id, a profile whose
   * user has no SELLER account role, or a user whose status is not ACTIVE
   * (suspended/blocked/soft-deleted — DELETED covers the AUTH-008 soft delete)
   * all answer the same «Seller not found». `isSeller` on the profile row is
   * deliberately NOT the check — User.accountRoles is the authoritative hat
   * store (the profile flags merely mirror it).
   *
   * Payload assembly (3 lot queries + 1 name lookup, all seller-scoped, the
   * card include keeps it N+1-free):
   * - categories: ONE groupBy over the seller's visible ACTIVE lots
   *   (countActiveByCategory), then the name rows joined and ordered
   *   count desc → nameFa asc.
   * - activeLots: page 1 (limit 12) of findPublicBySeller ACTIVE — the exact
   *   findPublic visibility core.
   * - soldLots: page 1 (limit 4) of findPublicBySeller SOLD, newest soldAt.
   * Lot rows map through the lots module's strict card mapper (no
   * exactAddress/rejectionReason ever), resolved against PUBLIC_MEDIA_BASE_URL
   * at this boundary — the same discipline as LotsService.findPublic.
   */
  async getSellerPublicProfile(id: string): Promise<PublicSellerProfileDto> {
    const profile = await this.repository.findById(id);
    const user = profile ? await this.users.findById(profile.userId) : null;
    if (
      !profile ||
      !user ||
      user.status !== UserStatus.ACTIVE ||
      !user.accountRoles.includes(AccountRole.SELLER)
    ) {
      throw new NotFoundException('Seller not found');
    }

    const [categoryCounts, activePage, soldPage] = await Promise.all([
      this.lots.countActiveByCategory(user.id),
      this.lots.findPublicBySeller(user.id, {
        status: LotStatus.ACTIVE,
        page: 1,
        limit: SELLER_PROFILE_ACTIVE_LIMIT,
      }),
      this.lots.findPublicBySeller(user.id, {
        status: LotStatus.SOLD,
        page: 1,
        limit: SELLER_PROFILE_SOLD_LIMIT,
      }),
    ]);
    const categories = await this.resolveSellerCategories(categoryCounts);

    const mediaBaseUrl = requireAppConfig(this.config).storage.publicMediaBaseUrl;
    return toPublicSellerProfile(
      profile,
      user,
      categories,
      toLotCardPage(activePage, mediaBaseUrl),
      toLotCardPage(soldPage, mediaBaseUrl),
    );
  }

  /**
   * Name rows for the category chips, in the final payload order: count desc,
   * then nameFa (plain code-unit order — chips are display-only). A count row
   * whose category row vanished (historical edge — Category deletes are
   * restricted) is skipped, never a partial chip.
   */
  private async resolveSellerCategories(
    counts: Array<{ categoryId: string; _count: { _all: number } }>,
  ): Promise<SellerPublicCategoryDto[]> {
    if (counts.length === 0) {
      return [];
    }
    const rows = await this.categories.findManyByIds(counts.map((count) => count.categoryId));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const withCounts = counts.flatMap((count) => {
      const row = byId.get(count.categoryId);
      return row
        ? [{ id: row.id, nameFa: row.nameFa, slug: row.slug, count: count._count._all }]
        : [];
    });
    return withCounts
      .sort((a, b) => b.count - a.count || (a.nameFa < b.nameFa ? -1 : a.nameFa > b.nameFa ? 1 : 0))
      .map(({ id, nameFa, slug }) => ({ id, nameFa, slug }));
  }

  // --- validation helpers (service-level rules from the card) ---

  /** ≥1 of BUYER/SELLER — one account may hold both hats, never neither. */
  private assertRoles(dto: SaveOnboardingDto): void {
    if (!dto.isBuyer && !dto.isSeller) {
      throw new BadRequestException('Select at least one role: buyer or seller');
    }
  }

  private assertSellerFields(dto: SaveOnboardingDto): void {
    if (dto.isSeller && (dto.businessName == null || dto.businessName.trim().length === 0)) {
      throw new BadRequestException('businessName is required for sellers');
    }
  }

  /**
   * Geo pair check against the static list: province and city are written
   * together, never alone, and the city must belong to the province.
   */
  private assertValidLocation(province: string | null, city: string | null): void {
    if (province == null && city == null) {
      return;
    }
    if (province == null || city == null) {
      throw new BadRequestException('province and city must be sent together');
    }
    if (!findIranCity(province, city)) {
      throw new BadRequestException(`city "${city}" does not exist in province "${province}"`);
    }
  }

  /** Interests must reference existing, ACTIVE categories (≤10 via the DTO). */
  private async resolveInterestIds(ids: string[], tx: Tx): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.categories.findManyByIds(ids, tx);
    if (rows.length !== ids.length) {
      throw new BadRequestException('One or more interests reference unknown categories');
    }
    if (rows.some((row) => !row.isActive)) {
      throw new BadRequestException('Interest categories must be active');
    }
    return ids;
  }
}

function accountRolesOf(dto: SaveOnboardingDto): AccountRole[] {
  return accountRolesFromFlags(dto.isBuyer, dto.isSeller);
}

function accountRolesFromFlags(isBuyer: boolean, isSeller: boolean): AccountRole[] {
  return [...(isBuyer ? [AccountRole.BUYER] : []), ...(isSeller ? [AccountRole.SELLER] : [])];
}

/** Order-insensitive comparison — role sync writes only on a real change. */
function rolesEqual(current: AccountRole[], next: AccountRole[]): boolean {
  return (
    current.length === next.length &&
    next.every((role) => current.includes(role)) &&
    current.every((role) => next.includes(role))
  );
}

/** `''`/whitespace means "cleared" for businessName (mirrors onboarding trim). */
function normalizeOptionalText(value: string | null): string | null {
  if (value == null || value.trim().length === 0) {
    return null;
  }
  return value;
}

/**
 * Maps a Paginated page of card ROWS onto a Paginated page of card DTOs —
 * the PROF-002 envelopes reuse the lots module's strict card mapper verbatim
 * (cover URL resolved against PUBLIC_MEDIA_BASE_URL by the caller).
 */
function toLotCardPage(
  page: Paginated<LotCardRepositoryRow>,
  mediaBaseUrl: string,
): Paginated<LotCardResponseDto> {
  return { ...page, items: page.items.map((lot) => toLotCardResponse(lot, mediaBaseUrl)) };
}
