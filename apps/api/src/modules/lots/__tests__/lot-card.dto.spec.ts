import { LiquidationReason, LotCondition, LotStatus, LotUnit, PricingType } from '@prisma/client';
import { toLotCardResponse, type LotCardRow } from '../dto/lot-card.dto';

/**
 * MKT-001 mapper allowlist unit tests — the card payload must be EXACTLY the
 * documented key set (nothing leaks by default) and the cover URL rules must
 * hold (thumbKey preferred, storageKey fallback, null without a cover).
 */

const MEDIA_BASE = 'http://media.test';

const baseRow = (overrides: Partial<LotCardRow> = {}): LotCardRow => ({
  id: 'lot-cuid-1',
  code: 'Ab3dEf9Z',
  sellerId: 'seller-cuid-1',
  categoryId: 'cat-1',
  subcategoryId: null,
  title: 'عمده پیراهن مردانه — ۵۰ عدد',
  description: 'توضیحات کامل لات',
  quantity: 50,
  unit: LotUnit.PIECE,
  availableQuantity: 45,
  minOrderQuantity: 10,
  pricingType: PricingType.FIXED,
  totalPrice: 112_500_000,
  unitPrice: 2_250_000,
  condition: LotCondition.GRADE_A,
  liquidationReason: LiquidationReason.OVERSTOCK,
  province: 'tehran',
  city: 'tehran',
  locationHint: 'بازار بزرگ تهران',
  exactAddress: 'تهران، خیابان …، پلاک ۱۲',
  rejectionReason: 'عکس‌ها کیفیت کافی ندارند',
  status: LotStatus.ACTIVE,
  viewCount: 3,
  saveCount: 1,
  expiresAt: new Date('2026-10-05T00:00:00.000Z'),
  publishedAt: new Date('2026-09-01T00:00:00.000Z'),
  soldAt: null,
  featuredAt: null,
  deletedAt: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-02T00:00:00.000Z'),
  seller: {
    id: 'seller-cuid-1',
    name: 'مینا رضایی',
    profile: { businessName: 'تولیدی پوشاک مینا' },
  },
  media: [],
  ...overrides,
});

describe('toLotCardResponse (MKT-001 allowlist mapper)', () => {
  it('maps EXACTLY the card key set — no extra field leaks', () => {
    const card = toLotCardResponse(
      baseRow({
        media: [
          {
            isCover: true,
            mediaAsset: { thumbKey: '2026/09/thumbt.webp', storageKey: '2026/09/thumb.jpg' },
          },
        ],
      }),
      MEDIA_BASE,
    );

    expect(Object.keys(card).sort()).toEqual([
      'availableQuantity',
      'city',
      'code',
      'condition',
      'coverThumbUrl',
      'createdAt',
      'expiresAt',
      'id',
      'province',
      'quantity',
      'seller',
      'title',
      'totalPrice',
      'unit',
      'unitPrice',
      'updatedAt',
      'verifiedSeller',
    ]);
  });

  it('never carries the private or detail-only fields', () => {
    const card = toLotCardResponse(baseRow(), MEDIA_BASE);
    expect(card).not.toHaveProperty('exactAddress');
    expect(card).not.toHaveProperty('rejectionReason');
    // locationHint is PUBLIC per plan §3 but belongs to the DETAIL page
    // (MKT-009 adds it there) — the card deliberately leaves it out.
    expect(card).not.toHaveProperty('locationHint');
    expect(card).not.toHaveProperty('sellerId');
    expect(card).not.toHaveProperty('media');
    // Raw source values are untouched by the mapper, proving the exclusions
    // come from the allowlist (not the fixture):
    expect(card.title).toBe('عمده پیراهن مردانه — ۵۰ عدد');
  });

  it('resolves coverThumbUrl from the isCover link: thumbKey preferred, absolute', () => {
    const card = toLotCardResponse(
      baseRow({
        media: [
          { isCover: false, mediaAsset: { thumbKey: null, storageKey: '2026/09/a.jpg' } },
          {
            isCover: true,
            mediaAsset: { thumbKey: '2026/09/bt.webp', storageKey: '2026/09/b.jpg' },
          },
        ],
      }),
      MEDIA_BASE,
    );
    // The flag picks the cover (the repository include pre-filters to it; the
    // wider gallery include still maps correctly), thumb wins over the original.
    expect(card.coverThumbUrl).toBe('http://media.test/2026/09/bt.webp');
  });

  it('falls back to storageKey when the cover has no thumb variant', () => {
    const card = toLotCardResponse(
      baseRow({
        media: [{ isCover: true, mediaAsset: { thumbKey: null, storageKey: '2026/09/c.jpg' } }],
      }),
      MEDIA_BASE,
    );
    expect(card.coverThumbUrl).toBe('http://media.test/2026/09/c.jpg');
  });

  it('returns coverThumbUrl null when the lot has no cover link', () => {
    const noMedia = toLotCardResponse(baseRow(), MEDIA_BASE);
    const nonCoverOnly = toLotCardResponse(
      baseRow({ media: [{ isCover: false, mediaAsset: { thumbKey: null, storageKey: 'x.jpg' } }] }),
      MEDIA_BASE,
    );
    expect(noMedia.coverThumbUrl).toBeNull();
    expect(nonCoverOnly.coverThumbUrl).toBeNull();
  });

  it('maps the seller summary: profile businessName, null when the profile is absent', () => {
    const withProfile = toLotCardResponse(baseRow(), MEDIA_BASE);
    expect(withProfile.seller).toEqual({
      id: 'seller-cuid-1',
      name: 'مینا رضایی',
      businessName: 'تولیدی پوشاک مینا',
    });

    const withoutProfile = toLotCardResponse(
      baseRow({ seller: { id: 'seller-cuid-1', name: 'مینا رضایی', profile: null } }),
      MEDIA_BASE,
    );
    expect(withoutProfile.seller.businessName).toBeNull();
  });

  it('stamps verifiedSeller false (TRS-001/002 placeholder)', () => {
    const card = toLotCardResponse(baseRow(), MEDIA_BASE);
    expect(card.verifiedSeller).toBe(false);
  });
});
