import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AccountRole } from '@prisma/client';
import { findIranCity } from '../../common/constants/iran-geo';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesRepository } from '../categories/categories.repository';
import { UsersRepository } from '../users/users.repository';
import { toProfileResponse, type ProfileResponseDto } from './dto/profile-response.dto';
import type { SaveOnboardingDto } from './dto/save-onboarding.dto';
import { ProfilesRepository, type Tx } from './profiles.repository';

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
      const location = this.resolveLocation(dto);
      const interestIds = await this.resolveInterestIds(dto.interests ?? [], tx);

      const profile = await this.repository.upsert(
        userId,
        {
          displayName: dto.displayName,
          businessName: dto.businessName ?? null,
          ...location,
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
   * Geo pair check against the static list: the client always sends province +
   * city together; both-or-neither, and the city must belong to the province.
   */
  private resolveLocation(dto: SaveOnboardingDto): {
    province: string | null;
    city: string | null;
  } {
    const { province, city } = dto;
    if (province == null && city == null) {
      return { province: null, city: null };
    }
    if (province == null || city == null) {
      throw new BadRequestException('province and city must be sent together');
    }
    if (!findIranCity(province, city)) {
      throw new BadRequestException(`city "${city}" does not exist in province "${province}"`);
    }
    return { province, city };
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
  return [
    ...(dto.isBuyer ? [AccountRole.BUYER] : []),
    ...(dto.isSeller ? [AccountRole.SELLER] : []),
  ];
}
