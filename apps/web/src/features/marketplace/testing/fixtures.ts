import type { CategoryTreeNodeDto, LotCardResponseDto, Paginated } from '@monorepo/shared-types';
import { LOT_LIST_PAGE_SIZE } from '../schemas/browse-query';

/**
 * MKT-006 test fixtures — LotCardResponseDto / Paginated envelopes matching
 * the generated contract (mirror of the lots feature's testing/fixtures.ts)
 * plus a two-level category tree for the /c/{slug} slug-resolution tests.
 */
export function cardLotFixture(overrides: Partial<LotCardResponseDto> = {}): LotCardResponseDto {
  return {
    id: 'clxcard0001',
    code: '7Kd2Qm9x',
    title: 'عمده پیراهن مردانه — ۵۰ عدد',
    unitPrice: 2_250_000,
    totalPrice: 112_500_000,
    quantity: 50,
    availableQuantity: 50,
    unit: 'PIECE',
    condition: 'GRADE_A',
    city: 'tehran',
    province: 'tehran',
    coverThumbUrl: null,
    seller: { id: 'clxseller01', name: 'مینا رضایی', businessName: 'تولیدی پوشاک مینا' },
    verifiedSeller: false,
    updatedAt: '2026-09-05T09:00:00.000Z',
    createdAt: '2026-09-01T12:00:00.000Z',
    expiresAt: '2026-10-05T12:00:00.000Z',
    ...overrides,
  };
}

/**
 * One Paginated envelope page. `ids` may be shorter than a real page — the
 * pagination walk only reads page/limit/total, so a small item list with a
 * `total` beyond `page*limit` exercises "has next page" cheaply.
 */
export function cardPageFixture(
  page: number,
  ids: string[],
  total: number,
  limit: number = LOT_LIST_PAGE_SIZE,
): Paginated<LotCardResponseDto> {
  return {
    items: ids.map((id, index) =>
      cardLotFixture({ id, code: `code${page}${index}`, title: `لات ${id}` }),
    ),
    total,
    page,
    limit,
  };
}

export const CATEGORY_TREE_FIXTURE: CategoryTreeNodeDto[] = [
  {
    id: 'cat-apparel',
    nameFa: 'پوشاک',
    nameEn: 'Apparel',
    slug: 'apparel',
    children: [{ id: 'cat-men', nameFa: 'مردانه', nameEn: null, slug: 'men', children: [] }],
  },
  {
    id: 'cat-home',
    nameFa: 'خانه و آشپزخانه',
    nameEn: null,
    slug: 'home-kitchen',
    children: [],
  },
];
