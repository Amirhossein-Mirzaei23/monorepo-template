import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { CategoriesRepository } from '../categories.repository';
import { CategoriesService } from '../categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let fake: FakePrisma;

  beforeEach(async () => {
    fake = new FakePrisma();
    const repository = new CategoriesRepository(fake as unknown as PrismaService);
    service = new CategoriesService(repository, fake as unknown as PrismaService);
  });

  describe('tree', () => {
    beforeEach(async () => {
      await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 2 });
      await service.create({ nameFa: 'کفش', slug: 'shoes', sortOrder: 1 });
      const apparel = await fake.category.findUnique({ where: { slug: 'apparel' } });
      const shoes = await fake.category.findUnique({ where: { slug: 'shoes' } });
      await service.create({
        nameFa: 'مردانه',
        slug: 'apparel-men',
        parentId: apparel!.id,
        sortOrder: 1,
      });
      await service.create({
        nameFa: 'زنانه',
        slug: 'apparel-women',
        parentId: apparel!.id,
        sortOrder: 2,
      });
      await service.create({
        nameFa: 'بچگانه',
        slug: 'apparel-kids',
        parentId: apparel!.id,
        sortOrder: 2,
      });
      await service.create({
        nameFa: 'ورزشی',
        slug: 'shoes-sports',
        parentId: shoes!.id,
        sortOrder: 1,
      });
    });

    it('returns the two-level tree with children nested under their parent', async () => {
      const tree = await service.tree();

      expect(tree.map((node) => node.slug)).toEqual(['shoes', 'apparel']);
      const apparel = tree[1];
      expect(new Set(apparel?.children.map((child) => child.slug))).toEqual(
        new Set(['apparel-men', 'apparel-women', 'apparel-kids']),
      );
      expect(tree[0]?.children.map((child) => child.slug)).toEqual(['shoes-sports']);
      // Two levels exactly: tree children never nest further.
      for (const child of apparel?.children ?? []) {
        expect(child.children).toEqual([]);
      }
    });

    it('orders siblings by sortOrder, breaking ties on nameFa', async () => {
      const tree = await service.tree();
      // apparel-women and apparel-kids share sortOrder 2 → nameFa decides:
      // 'بچگانه' < 'زنانه' in code-point order.
      expect(tree[1]?.children.map((child) => child.slug)).toEqual([
        'apparel-men',
        'apparel-kids',
        'apparel-women',
      ]);
    });

    it('hides inactive categories at both levels', async () => {
      fake.seedCategory({ nameFa: 'مخفی', slug: 'hidden-root', sortOrder: 0, isActive: false });
      const apparel = await fake.category.findUnique({ where: { slug: 'apparel' } });
      fake.seedCategory({
        nameFa: 'مخفی‌فرزند',
        slug: 'hidden-child',
        parentId: apparel!.id,
        sortOrder: 0,
        isActive: false,
      });

      const tree = await service.tree();

      expect(tree.map((node) => node.slug)).not.toContain('hidden-root');
      expect(tree[1]?.children.map((child) => child.slug)).not.toContain('hidden-child');
    });

    it('exposes only the public node shape — no sortOrder/isActive/parentId', async () => {
      const tree = await service.tree();
      for (const node of [...tree, ...tree.flatMap((root) => root.children)]) {
        expect(Object.keys(node).sort()).toEqual(['children', 'id', 'nameEn', 'nameFa', 'slug']);
      }
    });
  });

  describe('create (guards shared with CAT-004 admin writes)', () => {
    it('creates a top-level category with defaults', async () => {
      const created = await service.create({
        nameFa: 'زیبایی و بهداشتی',
        slug: 'beauty-health',
        sortOrder: 1,
      });

      expect(created).toMatchObject({
        nameFa: 'زیبایی و بهداشتی',
        nameEn: null,
        slug: 'beauty-health',
        parentId: null,
        sortOrder: 1,
        isActive: true,
      });
    });

    it('creates a child under a top-level parent', async () => {
      const parent = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      const child = await service.create({
        nameFa: 'مردانه',
        slug: 'apparel-men',
        parentId: parent.id,
        sortOrder: 1,
      });

      expect(child.parentId).toBe(parent.id);
      const tree = await service.tree();
      expect(tree[0]?.children.map((c) => c.slug)).toEqual(['apparel-men']);
    });

    it('throws BadRequest when the parent is itself a child (depth ≤ 2 guard)', async () => {
      const parent = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      const child = await service.create({
        nameFa: 'مردانه',
        slug: 'apparel-men',
        parentId: parent.id,
        sortOrder: 1,
      });

      await expect(
        service.create({
          nameFa: 'تی‌شرت',
          slug: 'apparel-men-tshirt',
          parentId: child.id,
          sortOrder: 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound when the parent id does not exist', async () => {
      await expect(
        service.create({ nameFa: 'یتیم', slug: 'orphan', parentId: 'missing-id', sortOrder: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws Conflict on a duplicate slug (top-level or nested)', async () => {
      await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      await expect(
        service.create({ nameFa: 'پوشاک دیگر', slug: 'apparel', sortOrder: 2 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('treats an explicit null parentId as top-level', async () => {
      const created = await service.create({
        nameFa: 'کفش',
        slug: 'shoes',
        parentId: null,
        sortOrder: 1,
      });
      expect(created.parentId).toBeNull();
    });

    it('stores the optional nameEn and accepts isActive: false', async () => {
      const created = await service.create({
        nameFa: 'کالا مصرفی FMCG',
        nameEn: 'FMCG',
        slug: 'fmcg',
        sortOrder: 6,
        isActive: false,
      });
      expect(created.nameEn).toBe('FMCG');
      expect(created.isActive).toBe(false);
    });
  });
});
