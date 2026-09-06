import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Category, Profile, ProfileInterest, User } from '@prisma/client';
import { SELLER_BUSINESS_TYPES } from './save-onboarding.dto';

/** Interest row with its category resolved (as included by ProfilesRepository). */
export type ProfileInterestWithCategory = ProfileInterest & { category: Category };

/**
 * Read-only trust metrics block (PROF-001). Placeholders until the P1 jobs
 * land (PROF-005 rollup + review aggregates): counts report honest zeros,
 * averages/rates report null (rendered «—») because no data exists to average.
 */
export class ProfileMetricsDto {
  @ApiProperty({
    example: 0,
    description: 'Successfully completed deals — 0 until deals exist (P1)',
  })
  successfulTransactions!: number;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    type: Number,
    description: 'Average rating (1–5) — null until reviews are published (P1)',
  })
  averageRating!: number | null;

  @ApiProperty({ example: 0, description: 'Number of published ratings — 0 until P1' })
  ratingCount!: number;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    type: Number,
    description: 'Median first-response time in minutes — null until the PROF-005 rollup',
  })
  responseRateMinutes!: number | null;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    type: Number,
    description: 'Cancellation rate in percent — null until the PROF-005 rollup',
  })
  cancellationRate!: number | null;

  @ApiProperty({ example: 0, description: 'Currently active listings — 0 until lots exist' })
  activeListings!: number;
}

/** Placeholder values until the metrics jobs land (see ProfileMetricsDto). */
export const PROFILE_METRICS_PLACEHOLDER: ProfileMetricsDto = {
  successfulTransactions: 0,
  averageRating: null,
  ratingCount: 0,
  responseRateMinutes: null,
  cancellationRate: null,
  activeListings: 0,
};

/**
 * Own-profile response for GET/PATCH /profiles/me and PUT /profiles/onboarding
 * (ONB-001). province/city are geo slugs — the web resolves Persian labels from
 * its copy of the static list. verificationBadges is a placeholder until the
 * trust phase (TRS-001) attaches real badge rows.
 */
export class ProfileInterestCategoryDto {
  @ApiProperty({ example: 'clx…cuid' })
  id!: string;

  @ApiProperty({ example: 'پوشاک' })
  nameFa!: string;

  @ApiProperty({ example: 'apparel' })
  slug!: string;
}

export class ProfileResponseDto {
  @ApiProperty({ example: 'clx…cuid' })
  id!: string;

  @ApiProperty({ example: 'clx…cuid' })
  userId!: string;

  @ApiProperty({ example: 'مینا رضایی' })
  displayName!: string;

  @ApiPropertyOptional({ example: 'تولیدی پوشاک مینا', nullable: true, type: String })
  businessName!: string | null;

  @ApiPropertyOptional({ example: 'isfahan', nullable: true, type: String })
  province!: string | null;

  @ApiPropertyOptional({ example: 'kashan', nullable: true, type: String })
  city!: string | null;

  @ApiPropertyOptional({ example: 'خرید عمده پوشاک', nullable: true, type: String })
  bio!: string | null;

  @ApiPropertyOptional({ example: 'mina.apparel', nullable: true, type: String })
  instagram!: string | null;

  @ApiPropertyOptional({ example: 'https://mina-apparel.ir', nullable: true, type: String })
  website!: string | null;

  @ApiProperty({ example: true })
  isBuyer!: boolean;

  @ApiProperty({ example: false })
  isSeller!: boolean;

  @ApiPropertyOptional({ example: 6, nullable: true, type: Number })
  sellerYearsActive!: number | null;

  @ApiPropertyOptional({
    enum: SELLER_BUSINESS_TYPES,
    nullable: true,
  })
  sellerBusinessType!: string | null;

  @ApiPropertyOptional({
    example: 'تولیدکننده پوشاک زنانه',
    nullable: true,
    type: String,
  })
  sellerDescription!: string | null;

  @ApiProperty({ type: ProfileInterestCategoryDto, isArray: true })
  interests!: ProfileInterestCategoryDto[];

  @ApiProperty({
    type: [String],
    example: [],
    description: 'Placeholder until TRS-001 lands verification badges',
  })
  verificationBadges!: string[];

  @ApiProperty({
    type: ProfileMetricsDto,
    description: 'Read-only trust metrics — placeholder zeros/nulls until the P1 jobs',
  })
  metrics!: ProfileMetricsDto;

  @ApiProperty({
    example: true,
    description: 'User.onboardingCompletedAt is set — mirrors the /auth/me flag',
  })
  onboardingCompleted!: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;
}

/** Accepts both the repository row and structurally identical fakes. */
export function toProfileResponse(
  profile: Profile & { interests?: ProfileInterestWithCategory[] },
  user: Pick<User, 'onboardingCompletedAt'>,
): ProfileResponseDto {
  return {
    id: profile.id,
    userId: profile.userId,
    displayName: profile.displayName,
    businessName: profile.businessName,
    province: profile.province,
    city: profile.city,
    bio: profile.bio,
    instagram: profile.instagram,
    website: profile.website,
    isBuyer: profile.isBuyer,
    isSeller: profile.isSeller,
    sellerYearsActive: profile.sellerYearsActive,
    sellerBusinessType: profile.sellerBusinessType,
    sellerDescription: profile.sellerDescription,
    interests: (profile.interests ?? []).map((interest) => ({
      id: interest.category.id,
      nameFa: interest.category.nameFa,
      slug: interest.category.slug,
    })),
    // TRS-001 placeholder — badges are admin-granted verifications, none exist yet.
    verificationBadges: [],
    // PROF-001 placeholder — real values arrive with the P1 metrics jobs.
    metrics: PROFILE_METRICS_PLACEHOLDER,
    onboardingCompleted: user.onboardingCompletedAt != null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
