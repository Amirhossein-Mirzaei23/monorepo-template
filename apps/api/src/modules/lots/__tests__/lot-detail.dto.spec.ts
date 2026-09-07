import {
  LiquidationReason,
  LotCondition,
  LotStatus,
  LotUnit,
  MediaType,
  PricingType,
} from '@prisma/client';
import { toLotPublicDetailResponse, type LotDetailRow } from '../dto/lot-detail.dto';

/**
 * MKT-009 mapper allowlist unit tests — the public detail payload must be
 * EXACTLY the documented key set (nothing leaks by default): no exactAddress,
 * no rejectionReason, no seller contact fields, no counters. Also pins the
 * media mapping (ordered, absolute url, kind, thumbUrl, isCover), the
 * category/subcategory NAME rows and the verified:false placeholder.
 */

const MEDIA_BASE = 'http://media.test';

const baseRow = (overrides: Partial<LotDetailRow> = {}): LotDetailRow => ({
  id: 'lot-cuid-1',
  code: 'Ab3dEf9Z',
  sellerId: 'seller-cuid-1',
  categoryId: 'cat-1',
  subcategoryId: 'cat-1-child',
  title: 'عمده پیراهن مردانه — ۵۰ عدد',
  description: 'توضیحات کامل لات',
  quantity: 50,
  unit: LotUnit.PIECE,
  availableQuantity: 45,
  minOrderQuantity: 10,
  pricingType: PricingType.NEGOTIABLE,
  totalPrice: 112_500_000,
  unitPrice: 2_250_000,
  condition: LotCondition.GRADE_A,
  liquidationReason: LiquidationReason.OVERSTOCK,
  province: 'tehran',
  city: 'tehran',
  locationHint: 'بازار بزرگ تهران',
  exactAddress: 'تهران، خیابان …، پلاک ۱۲',
  rejectionReason: 'نامربوط — لات ACTIVE است',
  status: LotStatus.ACTIVE,
  viewCount: 123,
  saveCount: 7,
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
    profile: { businessName: 'تولیدی پوشاک مینا', city: 'tehran' },
  },
  category: { id: 'cat-1', nameFa: 'پوشاک', slug: 'apparel' },
  subcategory: { id: 'cat-1-child', nameFa: 'مردانه', slug: 'apparel-men' },
  media: [
    {
      id: 'link-1',
      lotId: 'lot-cuid-1',
      mediaAssetId: 'asset-1',
      sortOrder: 0,
      isCover: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      mediaAsset: {
        id: 'asset-1',
        ownerId: 'seller-cuid-1',
        type: MediaType.IMAGE,
        storageKey: '2026/09/a.jpg',
        thumbKey: '2026/09/at.webp',
        mime: 'image/jpeg',
        sizeBytes: 100,
        width: 800,
        height: 600,
        durationMs: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    {
      id: 'link-2',
      lotId: 'lot-cuid-1',
      mediaAssetId: 'asset-2',
      sortOrder: 1,
      isCover: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      mediaAsset: {
        id: 'asset-2',
        ownerId: 'seller-cuid-1',
        type: MediaType.VIDEO,
        storageKey: '2026/09/b.mp4',
        thumbKey: null,
        mime: 'video/mp4',
        sizeBytes: 100,
        width: 1080,
        height: 1920,
        durationMs: 30_000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
  ],
  ...overrides,
});

describe('toLotPublicDetailResponse (MKT-009 allowlist mapper)', () => {
  it('maps EXACTLY the detail key set — no extra field leaks', () => {
    const detail = toLotPublicDetailResponse(baseRow(), MEDIA_BASE);

    expect(Object.keys(detail).sort()).toEqual([
      'availableQuantity',
      'category',
      'city',
      'code',
      'condition',
      'createdAt',
      'description',
      'expiresAt',
      'id',
      'liquidationReason',
      'locationHint',
      'media',
      'minOrderQuantity',
      'pricingType',
      'province',
      'quantity',
      'seller',
      'status',
      'subcategory',
      'title',
      'totalPrice',
      'unit',
      'unitPrice',
      'updatedAt',
    ]);
  });

  it('never carries the private fields, the counters or the internal FKs', () => {
    const detail = toLotPublicDetailResponse(baseRow(), MEDIA_BASE);

    // Source values are set on the fixture, so the exclusions come from the
    // mapper's allowlist, not from empty data.
    expect(detail).not.toHaveProperty('exactAddress');
    expect(detail).not.toHaveProperty('rejectionReason');
    expect(detail).not.toHaveProperty('viewCount');
    expect(detail).not.toHaveProperty('saveCount');
    expect(detail).not.toHaveProperty('sellerId');
    expect(detail).not.toHaveProperty('categoryId');
    expect(detail).not.toHaveProperty('subcategoryId');
    expect(detail).not.toHaveProperty('publishedAt');
    expect(detail).not.toHaveProperty('soldAt');
    expect(detail).not.toHaveProperty('featuredAt');
    expect(detail).not.toHaveProperty('deletedAt');
  });

  it('leaks no private string anywhere in the serialized payload (incl. seller contact)', () => {
    const serialized = JSON.stringify(toLotPublicDetailResponse(baseRow(), MEDIA_BASE));

    expect(serialized).not.toContain('تهران، خیابان'); // exactAddress value
    expect(serialized).not.toContain('نامربوط'); // rejectionReason value
    expect(serialized).not.toContain('exactAddress');
    expect(serialized).not.toContain('rejectionReason');
    expect(serialized).not.toContain('phone');
  });

  it('maps the ordered gallery with absolute urls, kind, thumb and cover flag', () => {
    const detail = toLotPublicDetailResponse(baseRow(), MEDIA_BASE);

    expect(detail.media).toHaveLength(2);
    expect(detail.media[0]).toMatchObject({
      mediaAssetId: 'asset-1',
      kind: 'IMAGE',
      url: 'http://media.test/2026/09/a.jpg',
      thumbUrl: 'http://media.test/2026/09/at.webp',
      sortOrder: 0,
      isCover: true,
    });
    // Video: url = original bytes, thumbUrl = null without a poster (MEDIA-003).
    expect(detail.media[1]).toMatchObject({
      kind: 'VIDEO',
      url: 'http://media.test/2026/09/b.mp4',
      thumbUrl: null,
      sortOrder: 1,
      isCover: false,
    });
  });

  it('maps the seller block from the profile: businessName + city, verified placeholder false', () => {
    const withProfile = toLotPublicDetailResponse(baseRow(), MEDIA_BASE);
    expect(withProfile.seller).toEqual({
      id: 'seller-cuid-1',
      name: 'مینا رضایی',
      businessName: 'تولیدی پوشاک مینا',
      city: 'tehran',
      verified: false,
    });

    const withoutProfile = toLotPublicDetailResponse(
      baseRow({ seller: { id: 'seller-cuid-1', name: 'مینا رضایی', profile: null } }),
      MEDIA_BASE,
    );
    expect(withoutProfile.seller.businessName).toBeNull();
    expect(withoutProfile.seller.city).toBeNull();
    expect(withoutProfile.seller.verified).toBe(false);
  });

  it('maps the category path as NAME rows (fa label + slug) with a nullable subcategory', () => {
    const detail = toLotPublicDetailResponse(baseRow(), MEDIA_BASE);
    expect(detail.category).toEqual({ id: 'cat-1', nameFa: 'پوشاک', slug: 'apparel' });
    expect(detail.subcategory).toEqual({
      id: 'cat-1-child',
      nameFa: 'مردانه',
      slug: 'apparel-men',
    });

    const topLevel = toLotPublicDetailResponse(
      baseRow({ subcategory: null, subcategoryId: null }),
      MEDIA_BASE,
    );
    expect(topLevel.subcategory).toBeNull();
  });

  it('passes the public spec fields through untouched (price, spec enums, location)', () => {
    const detail = toLotPublicDetailResponse(baseRow(), MEDIA_BASE);

    expect(detail.code).toBe('Ab3dEf9Z');
    expect(detail.totalPrice).toBe(112_500_000);
    expect(detail.unitPrice).toBe(2_250_000);
    expect(detail.quantity).toBe(50);
    expect(detail.availableQuantity).toBe(45);
    expect(detail.minOrderQuantity).toBe(10);
    expect(detail.unit).toBe(LotUnit.PIECE);
    expect(detail.condition).toBe(LotCondition.GRADE_A);
    expect(detail.pricingType).toBe(PricingType.NEGOTIABLE);
    expect(detail.liquidationReason).toBe(LiquidationReason.OVERSTOCK);
    expect(detail.status).toBe(LotStatus.ACTIVE);
    expect(detail.province).toBe('tehran');
    expect(detail.city).toBe('tehran');
    expect(detail.locationHint).toBe('بازار بزرگ تهران');
  });

  it('maps media to [] for rows read without the gallery (defensive, like the owner mapper)', () => {
    const detail = toLotPublicDetailResponse(baseRow({ media: undefined }), MEDIA_BASE);
    expect(detail.media).toEqual([]);
  });
});
