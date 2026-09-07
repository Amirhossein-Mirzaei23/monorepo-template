import type { CategoryTreeNodeDto } from '@monorepo/shared-types';
import { findCategoryBySlug } from '../api/marketplace-api';
import {
  lotsBrowseQueryString,
  parseLotsBrowseParams,
  LOT_LIST_PAGE_SIZE,
  type LotsBrowseFilter,
} from '../schemas/browse-query';
import { CATEGORY_TREE_FIXTURE } from '../testing/fixtures';

/**
 * MKT-006 unit tests: URL-param validation (valid parse, per-field DROP of
 * malformed values — bad sort/enums/non-numeric bounds —, q trimming), the
 * ONE serializer both fetchers share, and the /c/{slug} slug resolution over
 * the category tree.
 */

describe('parseLotsBrowseParams', () => {
  it('parses every supported param, incl. repeatable arrays and numeric bounds', () => {
    const params = new URLSearchParams({
      q: 'تیشرت',
      categoryId: 'cat-1',
      subcategoryId: 'sub-2',
      city: 'tehran',
      province: 'tehran',
      pricingType: 'NEGOTIABLE',
      listedWithin: '7d',
      priceMin: '1000',
      priceMax: '2000000000',
      qtyMin: '5',
      qtyMax: '1000000',
      sort: 'priceAsc',
    });
    const filter = parseLotsBrowseParams(params);

    expect(filter).toEqual<LotsBrowseFilter>({
      q: 'تیشرت',
      categoryId: 'cat-1',
      subcategoryId: 'sub-2',
      city: 'tehran',
      province: 'tehran',
      pricingType: 'NEGOTIABLE',
      listedWithin: '7d',
      priceMin: 1000,
      priceMax: 2_000_000_000,
      qtyMin: 5,
      qtyMax: 1_000_000,
      sort: 'priceAsc',
    });
  });

  it('reads repeatable condition/reason params with OR semantics', () => {
    const params = new URLSearchParams([
      ['condition', 'USED'],
      ['condition', 'GRADE_A'],
      ['liquidationReason', 'OVERSTOCK'],
    ]);

    const filter = parseLotsBrowseParams(params);
    expect(filter.condition).toEqual(['USED', 'GRADE_A']);
    expect(filter.liquidationReason).toEqual(['OVERSTOCK']);
  });

  it('drops malformed values individually and keeps the valid ones', () => {
    const params = new URLSearchParams([
      ['sort', 'bogus'], // not in the allowlist
      ['condition', 'USED'],
      ['condition', 'FAKE'], // unknown enum member
      ['priceMin', 'abc'], // non-numeric
      ['priceMax', '-5'], // out of range
      ['qtyMax', '2000000'], // over the 1M cap
      ['listedWithin', '90d'],
      ['pricingType', 'WHATEVER'],
      ['categoryId', ''], // empty → ignored
    ]);

    const filter = parseLotsBrowseParams(params);
    expect(filter.sort).toBeUndefined();
    expect(filter.condition).toEqual(['USED']);
    expect(filter.priceMin).toBeUndefined();
    expect(filter.priceMax).toBeUndefined();
    expect(filter.qtyMax).toBeUndefined();
    expect(filter.listedWithin).toBeUndefined();
    expect(filter.pricingType).toBeUndefined();
    expect(filter.categoryId).toBeUndefined();
  });

  it('trims q and over-long params are dropped', () => {
    const filter = parseLotsBrowseParams(new URLSearchParams({ q: '  تیشرت  ' }));
    expect(filter.q).toBe('تیشرت');

    const dropped = parseLotsBrowseParams(
      new URLSearchParams({ q: 'x'.repeat(101), city: 'y'.repeat(101) }),
    );
    expect(dropped.q).toBeUndefined();
    expect(dropped.city).toBeUndefined();
  });

  it('also accepts the RSC searchParams record shape', () => {
    const filter = parseLotsBrowseParams({ sort: 'priceDesc', condition: ['NEW', 'bogus'] });
    expect(filter.sort).toBe('priceDesc');
    expect(filter.condition).toEqual(['NEW']);
  });
});

describe('lotsBrowseQueryString', () => {
  it('serializes with fixed key order and repeated array params', () => {
    const search = lotsBrowseQueryString({
      q: 'shirt',
      condition: ['USED', 'NEW'],
      liquidationReason: ['OVERSTOCK'],
      sort: 'priceAsc',
      page: 2,
      limit: LOT_LIST_PAGE_SIZE,
    });

    // Scalars first (fixed key order), then the repeatable filters, then pagination.
    expect(search).toBe(
      `q=shirt&sort=priceAsc&condition=USED&condition=NEW&liquidationReason=OVERSTOCK&page=2&limit=${LOT_LIST_PAGE_SIZE}`,
    );
  });

  it('returns an empty string for an empty query', () => {
    expect(lotsBrowseQueryString({})).toBe('');
  });
});

describe('findCategoryBySlug', () => {
  const tree = CATEGORY_TREE_FIXTURE as CategoryTreeNodeDto[];

  it('finds top-level and nested categories by slug', () => {
    expect(findCategoryBySlug(tree, 'apparel')?.id).toBe('cat-apparel');
    expect(findCategoryBySlug(tree, 'men')?.id).toBe('cat-men');
    expect(findCategoryBySlug(tree, 'home-kitchen')?.id).toBe('cat-home');
  });

  it('returns undefined for an unknown slug (→ 404 at the route)', () => {
    expect(findCategoryBySlug(tree, 'nope')).toBeUndefined();
  });
});
