import {
  toPublicSellerProfile,
  type SellerProfilePublicRow,
} from '../dto/public-seller-profile.dto';
import type { LotCardResponseDto } from '../../lots/dto/lot-card.dto';
import type { Paginated } from '../../../common/dto/pagination-query.dto';

/**
 * PROF-002 unit — toPublicSellerProfile IS the public payload allowlist: it
 * must expose exactly the page fields and nothing else (no userId/phone/email,
 * no instagram/website, no seller extras), resolve the fa location labels
 * server-side via iran-geo (falling back to the raw slug when unknown), and
 * keep the TRS/PROF placeholders hard-coded (verified=false, badges=[],
 * metrics zeros/nulls — a true/value here would fake trust on a P0 surface).
 */
describe('toPublicSellerProfile (PROF-002 seller page mapper)', () => {
  const MEMBER_SINCE = new Date('2026-01-15T10:30:00.000Z');

  const row = (overrides: Partial<SellerProfilePublicRow> = {}): SellerProfilePublicRow => ({
    id: 'clxprofile1',
    displayName: 'مینا رضایی',
    businessName: 'تولیدی پوشاک مینا',
    bio: 'عمده‌فروشی پوشاک با ۱۰ سال سابقه',
    province: 'isfahan',
    city: 'kashan',
    ...overrides,
  });

  const emptyPage = (): Paginated<LotCardResponseDto> => ({
    items: [],
    total: 0,
    page: 1,
    limit: 12,
  });

  const mapped = (profileRow = row()) =>
    toPublicSellerProfile(profileRow, { createdAt: MEMBER_SINCE }, [], emptyPage(), emptyPage());

  it('maps the allowlisted page fields with fa location labels resolved server-side', () => {
    expect(mapped()).toEqual({
      id: 'clxprofile1',
      displayName: 'مینا رضایی',
      businessName: 'تولیدی پوشاک مینا',
      bio: 'عمده‌فروشی پوشاک با ۱۰ سال سابقه',
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
      memberSince: MEMBER_SINCE,
      categories: [],
      activeLots: emptyPage(),
      soldLots: emptyPage(),
    });
  });

  it('never leaks fields outside the page allowlist', () => {
    const payload = mapped() as unknown as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      'activeLots',
      'badges',
      'bio',
      'businessName',
      'categories',
      'city',
      'displayName',
      'id',
      'memberSince',
      'metrics',
      'province',
      'soldLots',
      'verified',
    ]);
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('instagram');
    expect(payload).not.toHaveProperty('website');
    expect(payload).not.toHaveProperty('sellerDescription');
  });

  it('keeps optional fields null when the profile has none', () => {
    const payload = mapped(row({ businessName: null, bio: null, province: null, city: null }));
    expect(payload.businessName).toBeNull();
    expect(payload.bio).toBeNull();
    expect(payload.province).toBeNull();
    expect(payload.city).toBeNull();
  });

  it('falls back to the raw stored slug when iran-geo does not know it', () => {
    const payload = mapped(row({ province: 'unknown-prov', city: 'unknown-city' }));
    expect(payload.province).toBe('unknown-prov');
    expect(payload.city).toBe('unknown-city');
  });

  it('carries the TRS-001/002 placeholders (verified:false, badges:[]) — never a real value', () => {
    const payload = mapped();
    expect(payload.verified).toBe(false);
    expect(payload.badges).toEqual([]);
  });

  it('carries the PROF-005 placeholder metrics (zeros + nulls, exact key set)', () => {
    const payload = mapped();
    expect(payload.metrics).toEqual({
      successfulTransactions: 0,
      ratingAverage: null,
      ratingCount: 0,
      responseRateMinutes: null,
      cancellationRate: 0,
    });
  });

  it('passes memberSince through from the user row (rendered Jalali web-side)', () => {
    expect(mapped().memberSince).toBe(MEMBER_SINCE);
  });
});
