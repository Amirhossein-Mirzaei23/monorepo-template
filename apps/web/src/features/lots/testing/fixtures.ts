import type { LotOwnerResponseDto } from '@monorepo/shared-types';

/**
 * Shared owner-shape lot fixture (LOT-002 response contract) for the lots
 * feature tests. `lotOwnerResponseSchema` validates this shape in the API
 * fetchers — keep it contract-exact.
 */

export const CATEGORY_TREE = [
  {
    id: 'cat-apparel',
    nameFa: 'پوشاک',
    nameEn: null,
    slug: 'apparel',
    children: [
      { id: 'cat-apparel-men', nameFa: 'مردانه', nameEn: null, slug: 'apparel-men', children: [] },
    ],
  },
];

export function ownerLotFixture(
  overrides: Partial<LotOwnerResponseDto> & { media?: LotOwnerResponseDto['media'] } = {},
): LotOwnerResponseDto {
  return {
    id: 'lot-1',
    code: '7Kd2Qm9x',
    sellerId: 'user-1',
    categoryId: 'cat-apparel',
    subcategoryId: 'cat-apparel-men',
    title: 'عمده پیراهن مردانه — ۵۰ عدد',
    description: 'توضیحات کامل کالا، جنس و شرایط فروش',
    quantity: 50,
    unit: 'PIECE',
    availableQuantity: 50,
    minOrderQuantity: 10,
    pricingType: 'NEGOTIABLE',
    totalPrice: 112_500_000,
    unitPrice: 2_250_000,
    condition: 'GRADE_A',
    liquidationReason: 'OVERSTOCK',
    province: 'tehran',
    city: 'tehran',
    locationHint: 'بازار بزرگ تهران',
    status: 'DRAFT',
    viewCount: 0,
    saveCount: 0,
    expiresAt: '2026-10-05T00:00:00.000Z',
    publishedAt: null,
    soldAt: null,
    featuredAt: null,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
    media: [],
    exactAddress: 'تهران، خیابان …، پلاک ۱۲',
    rejectionReason: null,
    ...overrides,
  } as LotOwnerResponseDto;
}

export const LOT_MEDIA_ROW = {
  id: 'lotmedia-1',
  mediaAssetId: 'asset-1',
  kind: 'IMAGE' as const,
  url: 'http://localhost:3001/media/2026/09/asset-1.jpg',
  thumbUrl: 'http://localhost:3001/media/2026/09/asset-1t.webp',
  sortOrder: 0,
  isCover: true,
};
