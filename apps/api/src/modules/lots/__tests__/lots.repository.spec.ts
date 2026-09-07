import {
  LotCondition,
  LiquidationReason,
  LotStatus,
  LotUnit,
  MediaType,
  PricingType,
  type Lot,
} from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { generateLotCode } from '../lots.constants';
import { LotsRepository, LOT_CARD_INCLUDE } from '../lots.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TIME = new Date('2026-09-01T10:00:00.000Z');

/** Any field the fake's seeder accepts, all optional — tests override per case. */
type SeedLotOverrides = Partial<Parameters<FakePrisma['seedLot']>[0]>;

describe('LotsRepository', () => {
  let fake: FakePrisma;
  let repository: LotsRepository;

  /** Seed a sane ACTIVE lot; overrides control everything per test. */
  const seedLot = (overrides: SeedLotOverrides = {}): Lot =>
    fake.seedLot({
      sellerId: 'seller-1',
      categoryId: 'cat-1',
      title: 'کفش ورزشی عمده',
      quantity: 50,
      availableQuantity: 50,
      minOrderQuantity: 5,
      pricingType: PricingType.FIXED,
      totalPrice: 50_000_000,
      unitPrice: 1_000_000,
      condition: LotCondition.GRADE_A,
      liquidationReason: LiquidationReason.OVERSTOCK,
      province: 'tehran',
      city: 'tehran',
      status: LotStatus.ACTIVE,
      expiresAt: new Date(BASE_TIME.getTime() + 7 * DAY_MS),
      ...overrides,
    });

  beforeAll(() => {
    // Deterministic "now" anchor for the createdAt/ending-soon sorts.
    jest.useFakeTimers({ now: BASE_TIME });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    fake = new FakePrisma();
    repository = new LotsRepository(fake as unknown as PrismaService);
  });

  describe('findPublic', () => {
    it('returns only ACTIVE lots (drafts, paused, expired-status, removed are hidden)', async () => {
      seedLot({ title: 'active' });
      seedLot({ title: 'draft', status: LotStatus.DRAFT });
      seedLot({ title: 'pending', status: LotStatus.PENDING_REVIEW });
      seedLot({ title: 'paused', status: LotStatus.PAUSED });
      seedLot({ title: 'expired-status', status: LotStatus.EXPIRED });
      seedLot({ title: 'removed', status: LotStatus.REMOVED, deletedAt: new Date() });
      seedLot({ title: 'sold', status: LotStatus.SOLD });

      const result = await repository.findPublic();

      expect(result.items.map((lot) => lot.title)).toEqual(['active']);
      expect(result.total).toBe(1);
    });

    it('hides ACTIVE lots past expiresAt (safety filter before the LOT-006 sweep)', async () => {
      seedLot({ title: 'fresh' });
      seedLot({
        title: 'stale',
        expiresAt: new Date(BASE_TIME.getTime() - DAY_MS),
      });

      const result = await repository.findPublic();

      expect(result.items.map((lot) => lot.title)).toEqual(['fresh']);
    });

    it('never surfaces PAUSED lots — a lot paused after publication disappears immediately (LOT-003)', async () => {
      const paused = seedLot({ title: 'will-be-paused' });
      seedLot({ title: 'still-active' });

      const before = await repository.findPublic();
      // Fake timers freeze createdAt, so ordering is insertion order — compare sorted.
      expect(before.items.map((lot) => lot.title).sort()).toEqual([
        'still-active',
        'will-be-paused',
      ]);

      // The LOT-003 pause action is a bare status flip on the row:
      await repository.update(paused.id, { status: LotStatus.PAUSED });

      const after = await repository.findPublic();
      expect(after.items.map((lot) => lot.title)).toEqual(['still-active']);

      // Stays hidden even with plenty of expiry time left — the status
      // predicate alone (not the expiry filter) excludes PAUSED.
      await repository.update(paused.id, {
        expiresAt: new Date(BASE_TIME.getTime() + 30 * DAY_MS),
      });
      expect((await repository.findPublic()).items.map((lot) => lot.title)).toEqual([
        'still-active',
      ]);
    });

    it('filters by categoryId and subcategoryId', async () => {
      seedLot({ title: 'target', subcategoryId: 'sub-1' });
      seedLot({ title: 'other-category', categoryId: 'cat-2' });
      seedLot({ title: 'other-sub', categoryId: 'cat-3', subcategoryId: 'sub-2' });

      const byCategory = await repository.findPublic({ filters: { categoryId: 'cat-1' } });
      const bySub = await repository.findPublic({ filters: { subcategoryId: 'sub-1' } });

      expect(byCategory.items.map((lot) => lot.title)).toEqual(['target']);
      expect(bySub.items.map((lot) => lot.title)).toEqual(['target']);
    });

    it('filters by city and province', async () => {
      seedLot({ title: 'tehran-tehran' });
      seedLot({ title: 'karaj', city: 'karaj' });
      seedLot({ title: 'esfahan', province: 'esfahan', city: 'esfahan' });

      const byCity = await repository.findPublic({ filters: { city: 'tehran' } });
      const byProvince = await repository.findPublic({ filters: { province: 'esfahan' } });

      expect(byCity.items.map((lot) => lot.title)).toEqual(['tehran-tehran']);
      expect(byProvince.items.map((lot) => lot.title)).toEqual(['esfahan']);
    });

    it('filters by pricingType and condition set (OR semantics)', async () => {
      seedLot({ title: 'fixed-a', condition: LotCondition.GRADE_A });
      seedLot({
        title: 'negotiable-b',
        pricingType: PricingType.NEGOTIABLE,
        condition: LotCondition.GRADE_B,
      });
      seedLot({ title: 'mixed', condition: LotCondition.MIXED });

      const byPricing = await repository.findPublic({
        filters: { pricingType: PricingType.NEGOTIABLE },
      });
      const byCondition = await repository.findPublic({
        filters: { condition: [LotCondition.GRADE_A, LotCondition.GRADE_B] },
      });

      expect(byPricing.items.map((lot) => lot.title)).toEqual(['negotiable-b']);
      expect(byCondition.items.map((lot) => lot.title)).toEqual(['fixed-a', 'negotiable-b']);
    });

    it('filters by inclusive unitPrice bounds', async () => {
      seedLot({ title: 'cheap', unitPrice: 100_000 });
      seedLot({ title: 'mid', unitPrice: 500_000 });
      seedLot({ title: 'pricey', unitPrice: 2_000_000 });

      const minOnly = await repository.findPublic({ filters: { unitPriceMin: 500_000 } });
      const maxOnly = await repository.findPublic({ filters: { unitPriceMax: 500_000 } });
      const both = await repository.findPublic({
        filters: { unitPriceMin: 100_000, unitPriceMax: 1_000_000 },
      });

      expect(minOnly.items.map((lot) => lot.title)).toEqual(['mid', 'pricey']);
      expect(maxOnly.items.map((lot) => lot.title)).toEqual(['cheap', 'mid']);
      expect(both.items.map((lot) => lot.title)).toEqual(['cheap', 'mid']);
    });

    it('searches case-insensitively across title and description', async () => {
      seedLot({ title: 'iPhone 13 pallet', description: 'sealed boxes' });
      seedLot({ title: 'کفش عمده', description: 'کارتن آیفون اصل' });
      seedLot({ title: 'unrelated', description: 'nothing here' });

      const byTitle = await repository.findPublic({ filters: { query: 'iphone' } });
      const byDescription = await repository.findPublic({ filters: { query: 'آیفون' } });
      const noHit = await repository.findPublic({ filters: { query: 'samsung' } });

      expect(byTitle.items).toHaveLength(1);
      expect(byDescription.items).toHaveLength(1);
      expect(noHit.items).toHaveLength(0);
    });

    it('composes filters with the search query', async () => {
      seedLot({ title: 'iphone tehran', city: 'tehran' });
      seedLot({ title: 'iphone karaj', city: 'karaj' });

      const result = await repository.findPublic({
        filters: { query: 'iphone', city: 'karaj' },
      });

      expect(result.items.map((lot) => lot.title)).toEqual(['iphone karaj']);
    });

    it('sorts by newest (createdAt desc) by default', async () => {
      seedLot({ title: 'oldest', createdAt: new Date(BASE_TIME.getTime() - 2 * DAY_MS) });
      seedLot({ title: 'newest', createdAt: new Date(BASE_TIME.getTime() + DAY_MS) });
      seedLot({ title: 'middle' });

      const result = await repository.findPublic();

      expect(result.items.map((lot) => lot.title)).toEqual(['newest', 'middle', 'oldest']);
    });

    it('sorts by priceAsc and priceDesc on unitPrice', async () => {
      seedLot({ title: 'mid', unitPrice: 500_000 });
      seedLot({ title: 'cheap', unitPrice: 100_000 });
      seedLot({ title: 'pricey', unitPrice: 900_000 });

      const asc = await repository.findPublic({ sort: 'priceAsc' });
      const desc = await repository.findPublic({ sort: 'priceDesc' });

      expect(asc.items.map((lot) => lot.title)).toEqual(['cheap', 'mid', 'pricey']);
      expect(desc.items.map((lot) => lot.title)).toEqual(['pricey', 'mid', 'cheap']);
    });

    it('sorts by quantityAsc and quantityDesc on quantity', async () => {
      seedLot({ title: 'many', quantity: 500 });
      seedLot({ title: 'few', quantity: 5 });
      seedLot({ title: 'some', quantity: 50 });

      const asc = await repository.findPublic({ sort: 'quantityAsc' });
      const desc = await repository.findPublic({ sort: 'quantityDesc' });

      expect(asc.items.map((lot) => lot.title)).toEqual(['few', 'some', 'many']);
      expect(desc.items.map((lot) => lot.title)).toEqual(['many', 'some', 'few']);
    });

    it('sorts by updatedAt (recently edited first)', async () => {
      seedLot({ title: 'old-edit', createdAt: new Date(BASE_TIME.getTime() + 3 * DAY_MS) });
      const fresh = seedLot({ title: 'fresh-edit' });
      // The frozen clock stamps every seed with BASE_TIME — advance it so the
      // edit's updatedAt bump is observable.
      jest.setSystemTime(new Date(BASE_TIME.getTime() + 60_000));
      await repository.update(fresh.id, { description: 'ویرایش تازه' });

      const result = await repository.findPublic({ sort: 'updatedAt' });

      // The edit lifted fresh-edit's updatedAt past the later-created row's.
      expect(result.items.map((lot) => lot.title)).toEqual(['fresh-edit', 'old-edit']);
    });

    it('sorts by expiresAt asc (ending soon)', async () => {
      seedLot({ title: 'late', expiresAt: new Date(BASE_TIME.getTime() + 30 * DAY_MS) });
      seedLot({ title: 'soon', expiresAt: new Date(BASE_TIME.getTime() + DAY_MS) });
      seedLot({ title: 'middle', expiresAt: new Date(BASE_TIME.getTime() + 7 * DAY_MS) });

      const result = await repository.findPublic({ sort: 'expiresAt' });

      expect(result.items.map((lot) => lot.title)).toEqual(['soon', 'middle', 'late']);
    });

    it('joins the CARD include (seller select + single cover link) in one findMany call set — no N+1', async () => {
      const seller = fake.seedUser({ phone: '09351112233', name: 'مینا رضایی' });
      fake.seedProfile({
        userId: seller.id,
        displayName: 'مینا',
        businessName: 'تولیدی پوشاک مینا',
      });
      const lot = seedLot({ sellerId: seller.id, title: 'card' });
      const asset = fake.seedMediaAsset({
        ownerId: seller.id,
        type: MediaType.IMAGE,
        mime: 'image/jpeg',
        sizeBytes: 10,
        storageKey: '2026/09/cover.jpg',
        thumbKey: '2026/09/covert.webp',
      });
      fake.seedLotMedia({ lotId: lot.id, mediaAssetId: asset.id, sortOrder: 0, isCover: true });

      const findManySpy = jest.spyOn(fake.lot, 'findMany');
      const result = await repository.findPublic();

      // The repository must request EXACTLY the card include — the seller
      // summary select and the single isCover link with its asset keys.
      const args = findManySpy.mock.calls[0]?.[0] as { include?: unknown };
      expect(args.include).toEqual(LOT_CARD_INCLUDE);
      // And one page = ONE findMany (relations batch in the same query set).
      expect(findManySpy.mock.calls).toHaveLength(1);

      const card = result.items[0]!;
      expect(card.seller).toMatchObject({ id: seller.id, name: 'مینا رضایی' });
      expect(card.seller.profile).toEqual({ businessName: 'تولیدی پوشاک مینا' });
      expect(card.media).toHaveLength(1);
      expect(card.media?.[0]).toMatchObject({
        isCover: true,
        mediaAsset: { thumbKey: '2026/09/covert.webp', storageKey: '2026/09/cover.jpg' },
      });
    });

    it('returns the Paginated envelope with page slicing', async () => {
      for (let i = 0; i < 5; i += 1) {
        seedLot({ title: `lot-${i}`, createdAt: new Date(BASE_TIME.getTime() + i * 1000) });
      }

      const page1 = await repository.findPublic({ page: 1, limit: 2 });
      const page3 = await repository.findPublic({ page: 3, limit: 2 });
      const past = await repository.findPublic({ page: 4, limit: 2 });

      expect(page1.total).toBe(5);
      expect(page1.page).toBe(1);
      expect(page1.limit).toBe(2);
      expect(page1.items.map((lot) => lot.title)).toEqual(['lot-4', 'lot-3']);
      expect(page3.items.map((lot) => lot.title)).toEqual(['lot-0']);
      expect(past.items).toEqual([]);
    });
  });

  describe('findBySellerAndId', () => {
    it('returns the lot for its owner', async () => {
      const lot = seedLot();

      const found = await repository.findBySellerAndId('seller-1', lot.id);

      expect(found?.id).toBe(lot.id);
    });

    it("returns null for another seller's lot (ownership stays a service check away)", async () => {
      const lot = seedLot();

      const found = await repository.findBySellerAndId('seller-2', lot.id);

      expect(found).toBeNull();
    });
  });

  describe('findMine (LOT-005)', () => {
    it('returns every non-REMOVED status of the caller and excludes REMOVED', async () => {
      seedLot({ title: 'draft', status: LotStatus.DRAFT });
      seedLot({ title: 'pending', status: LotStatus.PENDING_REVIEW });
      seedLot({ title: 'active' });
      seedLot({ title: 'paused', status: LotStatus.PAUSED });
      seedLot({ title: 'rejected', status: LotStatus.REJECTED });
      seedLot({ title: 'sold', status: LotStatus.SOLD });
      seedLot({ title: 'expired', status: LotStatus.EXPIRED });
      seedLot({ title: 'removed', status: LotStatus.REMOVED, deletedAt: new Date() });

      const result = await repository.findMine('seller-1');

      expect(result.items.map((lot) => lot.title).sort()).toEqual([
        'active',
        'draft',
        'expired',
        'paused',
        'pending',
        'rejected',
        'sold',
      ]);
      expect(result.total).toBe(7);
    });

    it('scopes strictly to the caller (ownership isolation)', async () => {
      seedLot({ title: 'mine' });
      seedLot({ sellerId: 'seller-2', title: 'theirs' });

      const mine = await repository.findMine('seller-1');
      const theirs = await repository.findMine('seller-2');

      expect(mine.items.map((lot) => lot.title)).toEqual(['mine']);
      expect(theirs.items.map((lot) => lot.title)).toEqual(['theirs']);
    });

    it('hides soft-deleted rows even if a status edit ever skipped the deletedAt stamp', async () => {
      seedLot({ title: 'live' });
      seedLot({ title: 'stamped', status: LotStatus.REMOVED, deletedAt: new Date() });

      const result = await repository.findMine('seller-1');

      expect(result.items.map((lot) => lot.title)).toEqual(['live']);
    });

    it('filters by a single status (the dashboard tabs)', async () => {
      seedLot({ title: 'draft-1', status: LotStatus.DRAFT });
      seedLot({ title: 'draft-2', status: LotStatus.DRAFT });
      seedLot({ title: 'active' });

      const drafts = await repository.findMine('seller-1', { status: LotStatus.DRAFT });
      const active = await repository.findMine('seller-1', { status: LotStatus.ACTIVE });
      const removed = await repository.findMine('seller-1', { status: LotStatus.REMOVED });

      expect(drafts.items.map((lot) => lot.title)).toEqual(['draft-1', 'draft-2']);
      expect(drafts.total).toBe(2);
      expect(active.items.map((lot) => lot.title)).toEqual(['active']);
      expect(removed.items).toEqual([]);
    });

    it('sorts newest first (createdAt desc) — the fixed inventory order', async () => {
      seedLot({ title: 'oldest', createdAt: new Date(BASE_TIME.getTime() - 2 * DAY_MS) });
      seedLot({ title: 'middle' });
      seedLot({ title: 'newest', createdAt: new Date(BASE_TIME.getTime() + DAY_MS) });

      const result = await repository.findMine('seller-1');

      expect(result.items.map((lot) => lot.title)).toEqual(['newest', 'middle', 'oldest']);
    });

    it('returns the Paginated envelope with page slicing', async () => {
      for (let i = 0; i < 5; i += 1) {
        seedLot({ title: `lot-${i}`, createdAt: new Date(BASE_TIME.getTime() + i * 1000) });
      }

      const page1 = await repository.findMine('seller-1', { page: 1, limit: 2 });
      const page3 = await repository.findMine('seller-1', { page: 3, limit: 2 });
      const past = await repository.findMine('seller-1', { page: 4, limit: 2 });

      expect(page1.total).toBe(5);
      expect(page1.page).toBe(1);
      expect(page1.limit).toBe(2);
      expect(page1.items.map((lot) => lot.title)).toEqual(['lot-4', 'lot-3']);
      expect(page3.items.map((lot) => lot.title)).toEqual(['lot-0']);
      expect(past.items).toEqual([]);
    });

    it('joins the ordered gallery (owner rows always carry media[])', async () => {
      const asset = fake.seedMediaAsset({
        ownerId: 'seller-1',
        type: MediaType.IMAGE,
        mime: 'image/png',
        sizeBytes: 10,
      });
      fake.seedLotMedia({
        lotId: seedLot({ title: 'with-media' }).id,
        mediaAssetId: asset.id,
        sortOrder: 0,
        isCover: true,
      });

      const result = await repository.findMine('seller-1');

      expect(result.items[0]?.media).toHaveLength(1);
      expect(result.items[0]?.media[0]?.isCover).toBe(true);
    });
  });

  describe('findById', () => {
    it('finds by id and returns null for unknown ids', async () => {
      const lot = seedLot();

      expect((await repository.findById(lot.id))?.id).toBe(lot.id);
      expect(await repository.findById('missing')).toBeNull();
    });
  });

  describe('create', () => {
    it('persists the lot with DB defaults applied (DRAFT, zero counters)', async () => {
      const created = await repository.create({
        code: 'Ab3dEf9Z',
        sellerId: 'seller-1',
        categoryId: 'cat-1',
        title: 'لوت جدید',
        description: 'توضیحات',
        quantity: 10,
        availableQuantity: 10,
        minOrderQuantity: 1,
        pricingType: PricingType.FIXED,
        totalPrice: 1_000_000,
        unitPrice: 100_000,
        condition: LotCondition.NEW,
        liquidationReason: LiquidationReason.EXCESS_PRODUCTION,
        province: 'tehran',
        city: 'tehran',
        expiresAt: new Date(BASE_TIME.getTime() + 30 * DAY_MS),
      });

      const stored = await fake.lot.findUnique({ where: { id: created.id } });
      expect(stored).toMatchObject({
        code: 'Ab3dEf9Z',
        status: LotStatus.DRAFT,
        unit: LotUnit.PIECE,
        viewCount: 0,
        saveCount: 0,
        exactAddress: null,
        rejectionReason: null,
        deletedAt: null,
      });
    });
  });

  describe('update', () => {
    it('mutates only the provided fields and keeps the row addressable', async () => {
      const lot = seedLot();

      const updated = await repository.update(lot.id, {
        title: 'عنوان تازه',
        status: LotStatus.ACTIVE,
      });

      expect(updated.title).toBe('عنوان تازه');
      expect(updated.status).toBe(LotStatus.ACTIVE);
      expect(updated.unitPrice).toBe(1_000_000);
    });
  });

  describe('incrementCounters', () => {
    it('increments viewCount alone via updateMany', async () => {
      const lot = seedLot({ viewCount: 3 });

      const count = await repository.incrementCounters(lot.id, { viewCount: 2 });

      expect(count).toBe(1);
      const stored = await fake.lot.findUnique({ where: { id: lot.id } });
      expect(stored).toMatchObject({ viewCount: 5, saveCount: 0 });
    });

    it('increments saveCount alone', async () => {
      const lot = seedLot({ saveCount: 7 });

      await repository.incrementCounters(lot.id, { saveCount: 1 });

      const stored = await fake.lot.findUnique({ where: { id: lot.id } });
      expect(stored).toMatchObject({ viewCount: 0, saveCount: 8 });
    });

    it('increments both counters in one atomic call', async () => {
      const lot = seedLot();

      await repository.incrementCounters(lot.id, { viewCount: 1, saveCount: 4 });

      const stored = await fake.lot.findUnique({ where: { id: lot.id } });
      expect(stored).toMatchObject({ viewCount: 1, saveCount: 4 });
    });

    it('reports 0 matched rows for an unknown id and changes nothing', async () => {
      const count = await repository.incrementCounters('missing', { viewCount: 5 });

      expect(count).toBe(0);
      expect(await fake.lot.count()).toBe(0);
    });
  });
});

describe('generateLotCode', () => {
  it('produces 8-char base62 codes', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateLotCode()).toMatch(/^[0-9A-Za-z]{8}$/);
    }
  });

  it('does not repeat codes across draws', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateLotCode()));
    expect(codes.size).toBe(1000);
  });
});
