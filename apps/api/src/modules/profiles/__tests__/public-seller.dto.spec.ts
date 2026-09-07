import { toPublicSellerSummary, type SellerProfileRow } from '../dto/public-seller.dto';

/**
 * MKT-004 unit — the public seller strip mapper IS the payload allowlist: it
 * must expose exactly the strip fields (id, displayName, businessName,
 * province, city, verified) and nothing else (no userId, no bio/contact/
 * metrics), and `verified` must stay the TRS-001 placeholder `false` until
 * real verification exists (a true here would fake trust on the home strip).
 */
describe('toPublicSellerSummary (MKT-004 sellers strip mapper)', () => {
  const row = (overrides: Partial<SellerProfileRow> = {}): SellerProfileRow => ({
    id: 'clxprofile1',
    displayName: 'مینا رضایی',
    businessName: 'تولیدی پوشاک مینا',
    province: 'isfahan',
    city: 'kashan',
    ...overrides,
  });

  it('maps the allowlisted strip fields', () => {
    expect(toPublicSellerSummary(row())).toEqual({
      id: 'clxprofile1',
      displayName: 'مینا رضایی',
      businessName: 'تولیدی پوشاک مینا',
      province: 'isfahan',
      city: 'kashan',
      verified: false,
    });
  });

  it('keeps optional fields null when the profile has none (buyer-turned-seller shape)', () => {
    expect(toPublicSellerSummary(row({ businessName: null, province: null, city: null }))).toEqual({
      id: 'clxprofile1',
      displayName: 'مینا رضایی',
      businessName: null,
      province: null,
      city: null,
      verified: false,
    });
  });

  it('never leaks fields outside the strip allowlist', () => {
    const payload = toPublicSellerSummary(row()) as unknown as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      'businessName',
      'city',
      'displayName',
      'id',
      'province',
      'verified',
    ]);
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('bio');
    expect(payload).not.toHaveProperty('instagram');
  });

  it('carries the TRS-001 placeholder verified:false (never true before verification exists)', () => {
    expect(toPublicSellerSummary(row()).verified).toBe(false);
  });
});
