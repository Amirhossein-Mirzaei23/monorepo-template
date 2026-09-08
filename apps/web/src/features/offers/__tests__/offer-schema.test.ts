import {
  OFFER_MAX_TOTAL_PRICE,
  makeOfferFormSchema,
  parseFaPositiveInteger,
} from '../schemas/offer-schema';

/**
 * OFR-004 zod mirror of the API's offer create/counter rules (OFR-001/002):
 * fa-digit tolerance, quantity bounded by the LOT's live bounds, unitPrice
 * 1..2B, note ≤ 500 (trimmed, empty → undefined) and the derived-total money
 * ceiling — the same rules the server revalidates with 409s.
 */

const BOUNDS = { minQuantity: 10, maxQuantity: 45 };

function parse(values: Partial<{ quantity: string; unitPrice: string; note: string }>) {
  return makeOfferFormSchema(BOUNDS).safeParse({
    quantity: '',
    unitPrice: '',
    note: '',
    ...values,
  });
}

describe('offer form schema (OFR-004 zod mirror)', () => {
  it.each([
    ['latin digits', '30', 30],
    ['persian digits', '۳۰', 30],
    ['arabic-indic digits', '٣٠', 30],
  ])('parses quantity with %s', (_label, raw, expected) => {
    const result = parse({ quantity: raw as string, unitPrice: '300000' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe(expected);
    }
  });

  it('strips thousand separators from prices (presentation, not value)', () => {
    const result = parse({ quantity: '10', unitPrice: '۳۰۰٬۰۰۰' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unitPrice).toBe(300000);
    }
  });

  it('rejects non-numeric residue instead of silently truncating', () => {
    expect(parseFaPositiveInteger('۱۲۰abc')).toBe(Number.NaN);
    expect(parseFaPositiveInteger('')).toBe(Number.NaN);
    expect(parseFaPositiveInteger('-5')).toBe(Number.NaN);
    expect(parseFaPositiveInteger('2.5')).toBe(Number.NaN);
  });

  it('rejects quantity outside the lot bounds (min..max, the 409 mirror)', () => {
    const below = parse({ quantity: '9', unitPrice: '300000' });
    const above = parse({ quantity: '۴۶', unitPrice: '300000' });
    expect(below.success).toBe(false);
    expect(above.success).toBe(false);
    if (!below.success) {
      expect(below.error.issues[0]?.message).toContain('۱۰');
      expect(below.error.issues[0]?.message).toContain('۴۵');
    }
  });

  it('bounds the unit price to 1..2B Toman', () => {
    expect(parse({ quantity: '10', unitPrice: '0' }).success).toBe(false);
    expect(parse({ quantity: '10', unitPrice: '2000000001' }).success).toBe(false);
    // 10 × 200,000,000 = exactly the 2B total ceiling → both rules pass.
    const ok = parse({ quantity: '10', unitPrice: '۲۰۰٬۰۰۰٬۰۰۰' });
    expect(ok.success).toBe(true);
  });

  it('caps the note at 500 code points, trims, and drops empties', () => {
    const empty = parse({ quantity: '10', unitPrice: '300000', note: '   ' });
    expect(empty.success).toBe(true);
    if (empty.success) {
      expect(empty.data.note).toBeUndefined();
    }

    const trimmed = parse({ quantity: '10', unitPrice: '300000', note: '  تا آخر هفته  ' });
    expect(trimmed.success).toBe(true);
    if (trimmed.success) {
      expect(trimmed.data.note).toBe('تا آخر هفته');
    }

    const tooLong = parse({ quantity: '10', unitPrice: '300000', note: 'ا'.repeat(501) });
    expect(tooLong.success).toBe(false);
  });

  it('rejects a derived total past the money ceiling on the unitPrice path', () => {
    // 45 × 50,000,000 = 2.25B > OFFER_MAX_TOTAL_PRICE.
    const result = parse({ quantity: '45', unitPrice: String(OFFER_MAX_TOTAL_PRICE) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('unitPrice');
    }
  });
});
