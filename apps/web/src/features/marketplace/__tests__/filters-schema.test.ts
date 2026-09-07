import type { LotsBrowseFilter } from '../schemas/browse-query';
import {
  browseHref,
  commitFiltersToParams,
  EMPTY_FILTERS_FORM,
  filtersFormSchema,
  formValuesFromFilter,
  normalizeNumericInput,
  PRICE_ORDER_MESSAGE,
  QTY_ORDER_MESSAGE,
  removeFilterParamValue,
} from '../schemas/filters-schema';

/**
 * MKT-008 unit tests for the filter sheet's form mirror: raw-input
 * normalization (fa digits, thousand separators), the zod validation (bounds
 * from the API caps, min ≤ max cross-field, unknown enum tokens), the
 * URL→form roundtrip, and the URL param surgery the sheet/sort/chips share.
 */

describe('normalizeNumericInput', () => {
  it('converts Persian and Arabic-Indic digits to Latin digits', () => {
    expect(normalizeNumericInput('۱۲۰۰۰۰')).toBe('120000');
    expect(normalizeNumericInput('٠٥')).toBe('05');
    expect(normalizeNumericInput('12۰3')).toBe('1203');
  });

  it('strips thousand separators and trims whitespace', () => {
    expect(normalizeNumericInput(' ۱٬۲۰۰٬۰۰۰ ')).toBe('1200000');
    expect(normalizeNumericInput('1,200,000')).toBe('1200000');
    expect(normalizeNumericInput('۱\u066c۲۰۰')).toBe('1200');
  });

  it('passes non-numeric characters through (the zod layer rejects them)', () => {
    expect(normalizeNumericInput('12abc')).toBe('12abc');
    expect(normalizeNumericInput('')).toBe('');
  });
});

describe('filtersFormSchema', () => {
  it('parses a full valid draft into the URL-face filter (numbers, enums, arrays)', () => {
    const parsed = filtersFormSchema.safeParse({
      ...EMPTY_FILTERS_FORM,
      categoryId: 'cat-apparel',
      subcategoryId: 'cat-men',
      priceMin: '۱٬۰۰۰٬۰۰۰',
      priceMax: '2000000000',
      qtyMin: '5',
      qtyMax: '1000000',
      province: 'tehran',
      city: 'tehran',
      condition: ['USED', 'NEW'],
      pricingType: 'NEGOTIABLE',
      liquidationReason: ['OVERSTOCK'],
      listedWithin: '7d',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({
      categoryId: 'cat-apparel',
      subcategoryId: 'cat-men',
      priceMin: 1_000_000,
      priceMax: 2_000_000_000,
      qtyMin: 5,
      qtyMax: 1_000_000,
      province: 'tehran',
      city: 'tehran',
      condition: ['USED', 'NEW'],
      pricingType: 'NEGOTIABLE',
      liquidationReason: ['OVERSTOCK'],
      listedWithin: '7d',
    });
  });

  it('maps an empty draft to an all-unset filter', () => {
    const parsed = filtersFormSchema.safeParse(EMPTY_FILTERS_FORM);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({
      categoryId: undefined,
      subcategoryId: undefined,
      priceMin: undefined,
      priceMax: undefined,
      qtyMin: undefined,
      qtyMax: undefined,
      province: undefined,
      city: undefined,
      condition: [],
      pricingType: undefined,
      liquidationReason: [],
      listedWithin: undefined,
    });
  });

  it('rejects out-of-bounds and non-numeric prices with the field message', () => {
    const overCap = filtersFormSchema.safeParse({ ...EMPTY_FILTERS_FORM, priceMin: '2000000001' });
    expect(overCap.success).toBe(false);

    const nonNumeric = filtersFormSchema.safeParse({ ...EMPTY_FILTERS_FORM, priceMax: '12abc' });
    expect(nonNumeric.success).toBe(false);
  });

  it('blocks priceMin > priceMax cross-field (card: min ≤ max)', () => {
    const parsed = filtersFormSchema.safeParse({
      ...EMPTY_FILTERS_FORM,
      priceMin: '500000',
      priceMax: '100000',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message === PRICE_ORDER_MESSAGE)).toBe(true);
    }
  });

  it('blocks qtyMin > qtyMax cross-field', () => {
    const parsed = filtersFormSchema.safeParse({
      ...EMPTY_FILTERS_FORM,
      qtyMin: '40',
      qtyMax: '30',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message === QTY_ORDER_MESSAGE)).toBe(true);
    }
  });

  it('rejects unknown pricingType tokens but accepts both freshness windows', () => {
    expect(
      filtersFormSchema.safeParse({ ...EMPTY_FILTERS_FORM, pricingType: 'WHATEVER' }).success,
    ).toBe(false);
    expect(
      filtersFormSchema.safeParse({ ...EMPTY_FILTERS_FORM, listedWithin: '30d' }).success,
    ).toBe(true);
    expect(
      filtersFormSchema.safeParse({ ...EMPTY_FILTERS_FORM, listedWithin: '90d' }).success,
    ).toBe(false);
  });
});

describe('formValuesFromFilter (URL → form roundtrip)', () => {
  it('converts every filter field back to its draft face, and parsing restores it', () => {
    const filter: LotsBrowseFilter = {
      categoryId: 'cat-apparel',
      subcategoryId: 'cat-men',
      priceMin: 1000,
      priceMax: 2_000_000_000,
      qtyMin: 5,
      qtyMax: 1000,
      province: 'tehran',
      city: 'tehran',
      condition: ['USED'],
      pricingType: 'FIXED',
      liquidationReason: ['OVERSTOCK', 'OTHER'],
      listedWithin: '30d',
    };

    const values = formValuesFromFilter(filter);
    expect(values.priceMin).toBe('1000');
    expect(values.condition).toEqual(['USED']);

    const parsed = filtersFormSchema.safeParse(values);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual(filter);
  });

  it('fills in the province for a bare city (globally unique city slugs)', () => {
    const values = formValuesFromFilter({ city: 'karaj' });
    expect(values.province).toBe('alborz');
    expect(values.city).toBe('karaj');
  });

  it('drops a city that does not belong to the parsed province', () => {
    const values = formValuesFromFilter({ province: 'tehran', city: 'karaj' });
    expect(values.province).toBe('tehran');
    expect(values.city).toBe('');
  });

  it('drops unknown city slugs while keeping the province', () => {
    const values = formValuesFromFilter({ province: 'tehran', city: 'atlantis' });
    expect(values.province).toBe('tehran');
    expect(values.city).toBe('');
  });
});

describe('URL param surgery (sheet / sort / chips helpers)', () => {
  it('commitFiltersToParams REPLACES filter params and keeps q/sort', () => {
    const current = new URLSearchParams('q=تیشرت&sort=priceAsc&priceMin=1&condition=USED');
    const next = commitFiltersToParams(current, {
      priceMin: 5000,
      condition: ['NEW'],
    });

    expect(next.get('q')).toBe('تیشرت');
    expect(next.get('sort')).toBe('priceAsc');
    expect(next.getAll('condition')).toEqual(['NEW']);
    expect(next.get('priceMin')).toBe('5000');
  });

  it('commitFiltersToParams(null) clears every filter param but keeps q/sort', () => {
    const current = new URLSearchParams(
      'q=تیشرت&sort=priceDesc&priceMax=9&city=tehran&pricingType=FIXED&listedWithin=7d',
    );
    const next = commitFiltersToParams(current, null);

    expect([...next.keys()].sort()).toEqual(['q', 'sort'].sort());
  });

  it('removeFilterParamValue deletes a whole key', () => {
    const next = removeFilterParamValue(new URLSearchParams('q=x&city=tehran'), 'city');
    expect(next.get('q')).toBe('x');
    expect(next.has('city')).toBe(false);
  });

  it('removeFilterParamValue removes ONE member of a repeated param', () => {
    const next = removeFilterParamValue(
      new URLSearchParams('condition=USED&condition=NEW&condition=GRADE_A'),
      'condition',
      'NEW',
    );
    expect(next.getAll('condition')).toEqual(['USED', 'GRADE_A']);
  });

  it('browseHref omits the «?» for an empty query', () => {
    expect(browseHref('/lots', new URLSearchParams())).toBe('/lots');
    expect(browseHref('/c/apparel', new URLSearchParams({ sort: 'priceAsc' }))).toBe(
      '/c/apparel?sort=priceAsc',
    );
  });
});
