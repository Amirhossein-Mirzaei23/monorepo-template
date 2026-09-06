import {
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AccountRole,
  LiquidationReason,
  LotCondition,
  LotStatus,
  LotUnit,
  PricingType,
} from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { CategoriesRepository } from '../../categories/categories.repository';
import { UsersRepository } from '../../users/users.repository';
import type { CreateLotDto } from '../dto/create-lot.dto';
import { toLotOwnerResponse, toLotPublicResponse } from '../dto/lot-response.dto';
import { LotsRepository } from '../lots.repository';
import { LotsService } from '../lots.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Grabs the rejection instead of try/catch noise in every test. */
async function rejectionOf(promise: Promise<unknown>): Promise<HttpException> {
  return promise.then(
    () => {
      throw new Error('expected the promise to reject');
    },
    (error: HttpException) => error,
  );
}

describe('LotsService', () => {
  let service: LotsService;
  let repository: LotsRepository;
  let fake: FakePrisma;
  let sellerId: string;
  let otherSellerId: string;
  let buyerId: string;
  let parent: { id: string };
  let child: { id: string };
  let otherParent: { id: string };
  let otherChild: { id: string };

  beforeEach(() => {
    fake = new FakePrisma();
    repository = new LotsRepository(fake as unknown as PrismaService);
    const users = new UsersRepository(fake as unknown as PrismaService);
    const categories = new CategoriesRepository(fake as unknown as PrismaService);
    service = new LotsService(repository, users, categories);

    sellerId = fake.seedUser({
      phone: '09111111111',
      name: 'Seller',
      accountRoles: [AccountRole.SELLER],
    }).id;
    otherSellerId = fake.seedUser({
      phone: '09122222222',
      name: 'Other',
      accountRoles: [AccountRole.SELLER],
    }).id;
    buyerId = fake.seedUser({ phone: '09133333333', name: 'Buyer' }).id;

    parent = fake.seedCategory({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
    child = fake.seedCategory({
      nameFa: 'مردانه',
      slug: 'apparel-men',
      parentId: parent.id,
      sortOrder: 1,
    });
    otherParent = fake.seedCategory({ nameFa: 'کفش', slug: 'shoes', sortOrder: 2 });
    otherChild = fake.seedCategory({
      nameFa: 'ورزشی',
      slug: 'shoes-sport',
      parentId: otherParent.id,
      sortOrder: 1,
    });
  });

  /** Minimal valid create payload — tests override what they exercise. */
  const createDto = (overrides: Partial<CreateLotDto> = {}): CreateLotDto => ({
    title: 'عمده پیراهن مردانه',
    description: 'توضیحات تست برای لات',
    categoryId: parent.id,
    quantity: 10,
    totalPrice: 1_000_000,
    pricingType: PricingType.FIXED,
    condition: LotCondition.GRADE_A,
    liquidationReason: LiquidationReason.OVERSTOCK,
    province: 'tehran',
    city: 'tehran',
    ...overrides,
  });

  /** Seeded lot with full valid content — tests override status/fields. */
  const seedLot = (overrides: Partial<Parameters<FakePrisma['seedLot']>[0]> = {}) =>
    fake.seedLot({
      sellerId,
      categoryId: parent.id,
      subcategoryId: child.id,
      title: 'مجموعه تیشرت تن‌پوش عمده',
      quantity: 10,
      availableQuantity: 10,
      minOrderQuantity: 5,
      pricingType: PricingType.FIXED,
      totalPrice: 1_000_000,
      unitPrice: 100_000,
      condition: LotCondition.GRADE_A,
      liquidationReason: LiquidationReason.OVERSTOCK,
      province: 'tehran',
      city: 'tehran',
      status: LotStatus.DRAFT,
      expiresAt: new Date(Date.now() + 30 * DAY_MS),
      ...overrides,
    });

  describe('permissions (SELLER_REQUIRED / ownership)', () => {
    it('rejects create for an authenticated user without the SELLER hat (403 + code)', async () => {
      const error = await rejectionOf(service.create(buyerId, createDto()));
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toMatchObject({ code: 'SELLER_REQUIRED' });
      const stored = await fake.lot.findUnique({ where: { id: 'x' } });
      expect(stored).toBeNull();
    });

    it('rejects update for a user without the SELLER hat (403 + code)', async () => {
      const lot = seedLot();
      const error = await rejectionOf(service.update(buyerId, lot.id, { title: 'عنوان تازه' }));
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toMatchObject({ code: 'SELLER_REQUIRED' });
    });

    it('rejects create/update when the token user no longer exists (401)', async () => {
      await expect(service.create('ghost-id', createDto())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.update('ghost-id', 'x', {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('PATCH by a non-owner seller is 403 (card rule — distinguishable from 404)', async () => {
      const lot = seedLot();
      await expect(
        service.update(otherSellerId, lot.id, { title: 'عنوان دزدان' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('PATCH for an unknown lot id is 404', async () => {
      await expect(service.update(sellerId, 'missing-id', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('saves a DRAFT by default with derived fields and defaults', async () => {
      const lot = await service.create(
        sellerId,
        createDto({
          availableQuantity: 7,
          minOrderQuantity: 3,
          unit: LotUnit.BOX,
          locationHint: 'بازار تهران',
          exactAddress: 'تهران، خیابان ۱، پلاک ۲',
        }),
      );

      expect(lot.status).toBe(LotStatus.DRAFT);
      expect(lot.code).toHaveLength(8);
      expect(lot.title).toBe('عمده پیراهن مردانه');
      expect(lot.unitPrice).toBe(100_000); // round(1_000_000 / 10)
      expect(lot.unit).toBe(LotUnit.BOX);
      expect(lot.availableQuantity).toBe(7);
      expect(lot.minOrderQuantity).toBe(3);
      expect(lot.exactAddress).toBe('تهران، خیابان ۱، پلاک ۲');
      expect(lot.rejectionReason).toBeNull();
      expect(lot.publishedAt).toBeNull();
    });

    it('defaults availableQuantity to quantity, minOrderQuantity to 1, unit to PIECE', async () => {
      const lot = await service.create(sellerId, createDto());
      expect(lot.availableQuantity).toBe(10);
      expect(lot.minOrderQuantity).toBe(1);
      expect(lot.unit).toBe(LotUnit.PIECE);
    });

    it('submits straight to PENDING_REVIEW when submit=true', async () => {
      const lot = await service.create(sellerId, createDto({ submit: true }));
      expect(lot.status).toBe(LotStatus.PENDING_REVIEW);
    });

    it.each([
      ['integer division remainder', 1_000_000, 3, 333_333],
      ['round half up', 5, 2, 3],
    ])('derives unitPrice (%s): round(%i / %i) = %i', async (_label, total, qty, expected) => {
      const lot = await service.create(sellerId, createDto({ totalPrice: total, quantity: qty }));
      expect(lot.unitPrice).toBe(expected);
    });

    it('sets expiresAt to +30 days on drafts too (listing safety filter)', async () => {
      const before = Date.now();
      const lot = await service.create(sellerId, createDto());
      const span = lot.expiresAt.getTime() - before;
      expect(span).toBeGreaterThanOrEqual(30 * DAY_MS - 1_000);
      expect(span).toBeLessThanOrEqual(30 * DAY_MS + 5_000);
    });

    it('stores the trimmed title and counts its bounds in code points', async () => {
      const lot = await service.create(sellerId, createDto({ title: '   فروش ویژه پیراهن   ' }));
      expect(lot.title).toBe('فروش ویژه پیراهن');
    });

    it.each([
      ['4 code points is too short', 'چهار'],
      ['121 code points is too long', 'ا'.repeat(121)],
      // 3 emoji = 3 code points (6 UTF-16 units) — a .length-based check would pass it.
      ['3 emoji are 3 code points', '👕👕👕'],
      ['whitespace-only trims to 0', '     '],
    ])('rejects titles that are fa-aware invalid: %s', async (_label, title) => {
      const error = await rejectionOf(service.create(sellerId, createDto({ title })));
      expect(error).toBeInstanceOf(Error);
      expect((error as HttpException).getStatus()).toBe(400);
    });

    it('accepts a 5-emoji title (5 code points, 10 UTF-16 units)', async () => {
      const lot = await service.create(sellerId, createDto({ title: '👕👕👕👕👕' }));
      expect(lot.title).toBe('👕👕👕👕👕');
    });

    it('rejects a category that does not exist or is inactive (400)', async () => {
      await expect(service.create(sellerId, createDto({ categoryId: 'missing' }))).rejects.toThrow(
        /active category/,
      );
      const inactive = fake.seedCategory({
        nameFa: 'منقضی',
        slug: 'old-cat',
        sortOrder: 9,
        isActive: false,
      });
      await expect(
        service.create(sellerId, createDto({ categoryId: inactive.id })),
      ).rejects.toThrow(/active category/);
    });

    it('rejects a subcategory that is not a direct child of the category (400)', async () => {
      await expect(
        service.create(sellerId, createDto({ subcategoryId: 'missing' })),
      ).rejects.toThrow(/does not exist/);
      await expect(
        service.create(sellerId, createDto({ subcategoryId: otherChild.id })),
      ).rejects.toThrow(/direct child/);
      const lot = await service.create(sellerId, createDto({ subcategoryId: child.id }));
      expect(lot.subcategoryId).toBe(child.id);
    });

    it.each([
      ['quantity 0', { quantity: 0 }],
      ['minOrder above quantity', { minOrderQuantity: 11 }],
      ['minOrder 0', { minOrderQuantity: 0 }],
      ['available above quantity', { availableQuantity: 11 }],
    ])('rejects %s with 400', async (_label, overrides) => {
      await expect(service.create(sellerId, createDto(overrides))).rejects.toThrow();
    });

    it('allows availableQuantity 0 (0 ≤ available ≤ quantity invariant)', async () => {
      const lot = await service.create(sellerId, createDto({ availableQuantity: 0 }));
      expect(lot.availableQuantity).toBe(0);
    });

    it.each([
      ['totalPrice 0', 0],
      ['totalPrice over the 2B toman cap', 2_000_000_001],
    ])('rejects %s with 400', async (_label, totalPrice) => {
      await expect(service.create(sellerId, createDto({ totalPrice }))).rejects.toThrow(
        /totalPrice/,
      );
    });

    it('accepts totalPrice at the exact 2,000,000,000 cap', async () => {
      const lot = await service.create(sellerId, createDto({ totalPrice: 2_000_000_000 }));
      expect(lot.totalPrice).toBe(2_000_000_000);
    });

    it.each([
      ['city outside the province', 'tehran', 'kashan'],
      ['unknown province slug', 'nowhere', 'tehran'],
    ])('rejects an invalid geo pair: %s (400)', async (_label, province, city) => {
      await expect(service.create(sellerId, createDto({ province, city }))).rejects.toThrow(
        /does not exist in province/,
      );
    });

    it('retries with a fresh code when create hits a unique violation (P2002)', async () => {
      const spy = jest.spyOn(repository, 'create').mockImplementationOnce((async () => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }) as unknown as typeof repository.create);

      const lot = await service.create(sellerId, createDto());

      expect(lot.code).toHaveLength(8);
      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    it('gives up with 500 after 3 consecutive code collisions', async () => {
      const spy = jest.spyOn(repository, 'create').mockImplementation((async () => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }) as unknown as typeof repository.create);

      await expect(service.create(sellerId, createDto())).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(spy).toHaveBeenCalledTimes(3);
      spy.mockRestore();
    });

    it('rethrows non-collision create errors untouched', async () => {
      const spy = jest.spyOn(repository, 'create').mockImplementation((async () => {
        throw new Error('db on fire');
      }) as unknown as typeof repository.create);

      await expect(service.create(sellerId, createDto())).rejects.toThrow('db on fire');
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });

  describe('update — DRAFT (full content edit)', () => {
    it('edits content, re-derives unitPrice and does NOT refresh expiresAt', async () => {
      const lot = seedLot({ locationHint: 'بازار تهران', subcategoryId: null });

      const updated = await service.update(sellerId, lot.id, {
        title: 'عنوان کاملاً تازه',
        province: 'alborz',
        city: 'karaj',
        locationHint: null,
        quantity: 6,
        availableQuantity: 6,
        totalPrice: 900_000,
      });

      expect(updated.title).toBe('عنوان کاملاً تازه');
      expect(updated.province).toBe('alborz');
      expect(updated.city).toBe('karaj');
      expect(updated.locationHint).toBeNull();
      expect(updated.unitPrice).toBe(150_000); // round(900_000 / 6)
      expect(updated.status).toBe(LotStatus.DRAFT);
      expect(updated.expiresAt.getTime()).toBe(lot.expiresAt.getTime());
    });

    it('submits a DRAFT: PENDING_REVIEW with a refreshed +30d expiry', async () => {
      const lot = seedLot({ expiresAt: new Date(Date.now() + 2 * DAY_MS) });

      const before = Date.now();
      const updated = await service.update(sellerId, lot.id, { submit: true });

      expect(updated.status).toBe(LotStatus.PENDING_REVIEW);
      const span = updated.expiresAt.getTime() - before;
      expect(span).toBeGreaterThanOrEqual(30 * DAY_MS - 1_000);
      expect(span).toBeLessThanOrEqual(30 * DAY_MS + 5_000);
    });

    it('clears the subcategory with an explicit null and switches to another child', async () => {
      const lot = seedLot();

      const cleared = await service.update(sellerId, lot.id, { subcategoryId: null });
      expect(cleared.subcategoryId).toBeNull();

      const moved = await service.update(sellerId, lot.id, {
        categoryId: otherParent.id,
        subcategoryId: otherChild.id,
      });
      expect(moved.categoryId).toBe(otherParent.id);
      expect(moved.subcategoryId).toBe(otherChild.id);
    });

    it('rejects a category change that orphans the existing subcategory (400)', async () => {
      const lot = seedLot({ subcategoryId: child.id });
      const error = await rejectionOf(
        service.update(sellerId, lot.id, { categoryId: otherParent.id }),
      );
      expect(error.getStatus()).toBe(400);
      expect(error.message).toMatch(/direct child/);
    });

    it('rejects an inactive/unknown replacement category (400)', async () => {
      const lot = seedLot({ subcategoryId: null });
      await expect(service.update(sellerId, lot.id, { categoryId: 'missing' })).rejects.toThrow(
        /active category/,
      );
    });

    it('validates the geo pair against the RESULTING location (400, nothing written)', async () => {
      const lot = seedLot();
      const error = await rejectionOf(service.update(sellerId, lot.id, { city: 'kashan' }));
      expect(error.getStatus()).toBe(400);

      const reread = await fake.lot.findUnique({ where: { id: lot.id } });
      expect(reread?.city).toBe('tehran');
    });

    it('rejects a resulting minOrder above the new quantity and writes nothing (400)', async () => {
      const lot = seedLot({ minOrderQuantity: 5 });
      const error = await rejectionOf(
        service.update(sellerId, lot.id, { quantity: 3, minOrderQuantity: 10 }),
      );
      expect(error.getStatus()).toBe(400);

      const reread = await fake.lot.findUnique({ where: { id: lot.id } });
      expect(reread?.quantity).toBe(10);
      expect(reread?.minOrderQuantity).toBe(5);
    });
  });

  describe('update — REJECTED (resubmit clears the verdict)', () => {
    it('keeps REJECTED and the rejectionReason on a plain content edit', async () => {
      const lot = seedLot({ status: LotStatus.REJECTED, rejectionReason: 'عکس‌ها نامناسب است' });

      const updated = await service.update(sellerId, lot.id, { title: 'عنوان اصلاح‌شده' });

      expect(updated.status).toBe(LotStatus.REJECTED);
      expect(updated.rejectionReason).toBe('عکس‌ها نامناسب است');
      expect(updated.title).toBe('عنوان اصلاح‌شده');
    });

    it('submit=true moves REJECTED to PENDING_REVIEW and clears rejectionReason', async () => {
      const lot = seedLot({ status: LotStatus.REJECTED, rejectionReason: 'عکس‌ها نامناسب است' });

      const updated = await service.update(sellerId, lot.id, {
        title: 'عنوان اصلاح‌شده',
        submit: true,
      });

      expect(updated.status).toBe(LotStatus.PENDING_REVIEW);
      expect(updated.rejectionReason).toBeNull();
    });

    it('a pure resubmit (no other field) also clears the verdict and refreshes expiry', async () => {
      const lot = seedLot({
        status: LotStatus.REJECTED,
        rejectionReason: 'رد شده',
        expiresAt: new Date(Date.now() + 2 * DAY_MS),
      });

      const updated = await service.update(sellerId, lot.id, { submit: true });

      expect(updated.status).toBe(LotStatus.PENDING_REVIEW);
      expect(updated.rejectionReason).toBeNull();
      expect(updated.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY_MS);
    });
  });

  describe('update — ACTIVE/PAUSED (price/quantity subset only)', () => {
    it('edits totalPrice on ACTIVE: unitPrice re-derived, status and publishedAt untouched', async () => {
      const publishedAt = new Date(Date.now() - 5 * DAY_MS);
      const lot = seedLot({ status: LotStatus.ACTIVE, publishedAt });

      const updated = await service.update(sellerId, lot.id, { totalPrice: 1_200_000 });

      expect(updated.status).toBe(LotStatus.ACTIVE);
      expect(updated.publishedAt?.getTime()).toBe(publishedAt.getTime());
      expect(updated.totalPrice).toBe(1_200_000);
      expect(updated.unitPrice).toBe(120_000);
    });

    it('re-derives unitPrice when only quantity changes (total unchanged)', async () => {
      const lot = seedLot({
        status: LotStatus.ACTIVE,
        minOrderQuantity: 2,
        availableQuantity: 4,
      });
      const updated = await service.update(sellerId, lot.id, { quantity: 4 });
      expect(updated.quantity).toBe(4);
      expect(updated.totalPrice).toBe(1_000_000);
      expect(updated.unitPrice).toBe(250_000);
    });

    it('edits price/quantity/minOrder/available together on PAUSED', async () => {
      const lot = seedLot({ status: LotStatus.PAUSED });
      const updated = await service.update(sellerId, lot.id, {
        totalPrice: 800_000,
        quantity: 8,
        minOrderQuantity: 2,
        availableQuantity: 6,
      });
      expect(updated.status).toBe(LotStatus.PAUSED);
      expect(updated.unitPrice).toBe(100_000);
      expect(updated.minOrderQuantity).toBe(2);
      expect(updated.availableQuantity).toBe(6);
    });

    it.each([
      ['title', { title: 'تغییر محتوایی' }],
      ['description', { description: 'تغییر محتوایی' }],
      ['categoryId', { categoryId: 'clx-any' }],
      ['condition', { condition: LotCondition.NEW }],
      ['province', { province: 'alborz' }],
      ['exactAddress', { exactAddress: 'آدرس تازه' }],
      ['submit', { submit: true }],
    ])(
      'rejects a %s edit on ACTIVE with 409 ILLEGAL_STATUS_EDIT (nothing written)',
      async (_label, patch) => {
        const lot = seedLot({ status: LotStatus.ACTIVE });
        const error = await rejectionOf(service.update(sellerId, lot.id, patch));
        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toMatchObject({ code: 'ILLEGAL_STATUS_EDIT' });

        const reread = await fake.lot.findUnique({ where: { id: lot.id } });
        expect(reread?.title).toBe(lot.title);
        expect(reread?.condition).toBe(lot.condition);
      },
    );

    it('rejects a content edit on PAUSED with 409 too', async () => {
      const lot = seedLot({ status: LotStatus.PAUSED });
      const error = await rejectionOf(service.update(sellerId, lot.id, { description: 'نه' }));
      expect(error.getResponse()).toMatchObject({ code: 'ILLEGAL_STATUS_EDIT' });
    });

    it('still validates state edits on ACTIVE (minOrder > new quantity → 400, no write)', async () => {
      const lot = seedLot({ status: LotStatus.ACTIVE });
      const error = await rejectionOf(
        service.update(sellerId, lot.id, { quantity: 2, minOrderQuantity: 5 }),
      );
      expect(error.getStatus()).toBe(400);

      const reread = await fake.lot.findUnique({ where: { id: lot.id } });
      expect(reread?.quantity).toBe(10);
    });
  });

  describe('update — frozen statuses (409)', () => {
    it.each([
      ['PENDING_REVIEW (in moderation)', LotStatus.PENDING_REVIEW],
      ['SOLD', LotStatus.SOLD],
      ['EXPIRED', LotStatus.EXPIRED],
      ['REMOVED', LotStatus.REMOVED],
    ])('PATCH on %s is 409 ILLEGAL_STATUS_EDIT', async (_label, status) => {
      const lot = seedLot({ status });
      const error = await rejectionOf(service.update(sellerId, lot.id, { totalPrice: 100_000 }));
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: 'ILLEGAL_STATUS_EDIT' });
    });
  });

  describe('response shape allowlist (two mappers)', () => {
    it('owner shape contains the private fields; public shape never does', () => {
      const lot = seedLot({
        status: LotStatus.REJECTED,
        exactAddress: 'تهران، کوچه ۲',
        rejectionReason: 'توضیحات ناکافی',
      });

      const owner = toLotOwnerResponse(lot);
      expect(owner.exactAddress).toBe('تهران، کوچه ۲');
      expect(owner.rejectionReason).toBe('توضیحات ناکافی');

      const pub = toLotPublicResponse(lot);
      expect(pub).not.toHaveProperty('exactAddress');
      expect(pub).not.toHaveProperty('rejectionReason');
    });

    it('public + owner keys are exactly the allowlisted sets', () => {
      const lot = seedLot();
      const publicKeys = Object.keys(toLotPublicResponse(lot)).sort();
      const ownerKeys = Object.keys(toLotOwnerResponse(lot)).sort();

      expect(publicKeys).toEqual([
        'availableQuantity',
        'categoryId',
        'city',
        'code',
        'condition',
        'createdAt',
        'description',
        'expiresAt',
        'featuredAt',
        'id',
        'liquidationReason',
        'locationHint',
        'minOrderQuantity',
        'pricingType',
        'province',
        'publishedAt',
        'quantity',
        'saveCount',
        'sellerId',
        'soldAt',
        'status',
        'subcategoryId',
        'title',
        'totalPrice',
        'unit',
        'unitPrice',
        'updatedAt',
        'viewCount',
      ]);
      expect(ownerKeys).toEqual([...publicKeys, 'exactAddress', 'rejectionReason'].sort());
    });
  });
});
