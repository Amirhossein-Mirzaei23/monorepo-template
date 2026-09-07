import type {
  LotCardResponseDto,
  Paginated,
  PublicSellerProfileDto,
  SellerPublicCategoryDto,
} from '@monorepo/shared-types';
import { cardLotFixture } from '@/features/marketplace';

/**
 * PROF-002 test fixtures — a contract-shaped PublicSellerProfileDto for suites
 * OUTSIDE the feature (route-group page tests cannot deep-import into
 * features/, so the fixture travels through the barrel like every other
 * export; the zod-validated page test then fails loudly if the fixture drifts
 * from the generated contract).
 */

/** Reusable card page (items derive from the marketplace card fixture). */
function sellerCardPage(
  ids: string[],
  total: number,
  limit: number,
  titlePrefix: string,
): Paginated<LotCardResponseDto> {
  return {
    items: ids.map((id, index) =>
      cardLotFixture({
        id,
        code: `sp${id.slice(-5)}`,
        title: `${titlePrefix} ${index + 1}`,
      }),
    ),
    total,
    page: 1,
    limit,
  };
}

export function sellerCategoryFixture(
  overrides: Partial<SellerPublicCategoryDto> = {},
): SellerPublicCategoryDto {
  return { id: 'cat-apparel', nameFa: 'پوشاک', slug: 'apparel', ...overrides };
}

export function sellerProfileFixture(
  overrides: Partial<PublicSellerProfileDto> = {},
): PublicSellerProfileDto {
  return {
    id: 'clxprofile999',
    displayName: 'مینا رضایی',
    businessName: 'تولیدی پوشاک مینا',
    bio: 'عمده‌فروشی پوشاک با ۱۰ سال سابقه — تحویل حضوری کاشان و ارسال به سراسر کشور',
    province: 'اصفهان',
    city: 'کاشان',
    verified: false,
    badges: [],
    metrics: {
      successfulTransactions: 0,
      ratingAverage: null,
      ratingCount: 0,
      responseRateMinutes: null,
      cancellationRate: 0,
    },
    memberSince: '2026-01-15T10:30:00.000Z',
    categories: [sellerCategoryFixture()],
    activeLots: sellerCardPage(['act1', 'act2', 'act3'], 12, 12, 'لات فعال فروشنده'),
    soldLots: sellerCardPage(['sold1', 'sold2'], 4, 4, 'لات فروخته‌شده'),
    ...overrides,
  };
}
