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

  describe('create sortOrder default (CAT-004: append-after-siblings)', () => {
    it('appends a top-level category after the last sibling when sortOrder is omitted', async () => {
      await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 4 });
      const appended = await service.create({ nameFa: 'کفش', slug: 'shoes' });

      expect(appended.sortOrder).toBe(5);
    });

    it('starts at 0 when there are no siblings yet', async () => {
      const created = await service.create({ nameFa: 'پوشاک', slug: 'apparel' });
      expect(created.sortOrder).toBe(0);
    });

    it('appends a child after its siblings under the same parent', async () => {
      const parent = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      await service.create({
        nameFa: 'مردانه',
        slug: 'apparel-men',
        parentId: parent.id,
        sortOrder: 7,
      });
      const child = await service.create({
        nameFa: 'زنانه',
        slug: 'apparel-women',
        parentId: parent.id,
      });

      expect(child.sortOrder).toBe(8);
    });
  });

  describe('update (CAT-004 admin writes)', () => {
    it('renames nameFa/nameEn and leaves other fields untouched', async () => {
      const created = await service.create({
        nameFa: 'پوشاک',
        nameEn: 'Apparel',
        slug: 'apparel',
        sortOrder: 3,
      });

      const updated = await service.update(created.id, { nameFa: 'پوشاک تک' });

      expect(updated).toMatchObject({
        id: created.id,
        nameFa: 'پوشاک تک',
        nameEn: 'Apparel',
        slug: 'apparel',
        sortOrder: 3,
        isActive: true,
      });
    });

    it('renames the slug', async () => {
      const created = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });

      const updated = await service.update(created.id, { slug: 'apparel-new' });

      expect(updated.slug).toBe('apparel-new');
    });

    it('allows patching with the category’s own current slug (no self-clash)', async () => {
      const created = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });

      await expect(
        service.update(created.id, { slug: 'apparel', nameFa: 'پوشاک' }),
      ).resolves.toMatchObject({ slug: 'apparel' });
    });

    it('throws Conflict when the new slug belongs to another category', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      await service.create({ nameFa: 'کفش', slug: 'shoes', sortOrder: 2 });

      await expect(service.update(apparel.id, { slug: 'shoes' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws NotFound for an unknown category id', async () => {
      await expect(service.update('missing-id', { nameFa: 'نام' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('re-parents a child under another top-level parent', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      const shoes = await service.create({ nameFa: 'کفش', slug: 'shoes', sortOrder: 2 });
      const child = await service.create({
        nameFa: 'مردانه',
        slug: 'apparel-men',
        parentId: apparel.id,
        sortOrder: 1,
      });

      const moved = await service.update(child.id, { parentId: shoes.id });

      expect(moved.parentId).toBe(shoes.id);
    });

    it('moves a child back to the top level with explicit null parentId', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      const child = await service.create({
        nameFa: 'مردانه',
        slug: 'apparel-men',
        parentId: apparel.id,
        sortOrder: 1,
      });

      const moved = await service.update(child.id, { parentId: null });

      expect(moved.parentId).toBeNull();
    });

    it('throws BadRequest when moving a parent under a parent (target is a child)', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      const child = await service.create({
        nameFa: 'مردانه',
        slug: 'apparel-men',
        parentId: apparel.id,
        sortOrder: 1,
      });

      await expect(service.update(apparel.id, { parentId: child.id })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequest when nesting a category that already has children', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      const shoes = await service.create({ nameFa: 'کفش', slug: 'shoes', sortOrder: 2 });
      await service.create({
        nameFa: 'مردانه',
        slug: 'apparel-men',
        parentId: apparel.id,
        sortOrder: 1,
      });

      // apparel has children — nesting it under shoes would push them to depth 3.
      await expect(service.update(apparel.id, { parentId: shoes.id })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequest when re-parenting a category under itself', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });

      await expect(service.update(apparel.id, { parentId: apparel.id })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFound when the new parent id does not exist', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });

      await expect(service.update(apparel.id, { parentId: 'missing-id' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deactivates via isActive: false — hidden from the public tree', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });

      const updated = await service.update(apparel.id, { isActive: false });

      expect(updated.isActive).toBe(false);
      const tree = await service.tree();
      expect(tree.map((node) => node.slug)).not.toContain('apparel');
    });
  });

  describe('reorder (CAT-004 sibling sortOrder swap)', () => {
    it('swaps sortOrder between top-level siblings', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      const shoes = await service.create({ nameFa: 'کفش', slug: 'shoes', sortOrder: 2 });

      const swapped = await service.reorder(apparel.id, { siblingId: shoes.id });

      expect(swapped.sortOrder).toBe(2);
      const shoesRow = await fake.category.findUnique({ where: { slug: 'shoes' } });
      expect(shoesRow?.sortOrder).toBe(1);
    });

    it('swaps sortOrder between siblings under the same parent', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      const men = await service.create({
        nameFa: 'مردانه',
        slug: 'apparel-men',
        parentId: apparel.id,
        sortOrder: 1,
      });
      const women = await service.create({
        nameFa: 'زنانه',
        slug: 'apparel-women',
        parentId: apparel.id,
        sortOrder: 2,
      });

      await service.reorder(women.id, { siblingId: men.id });

      const menRow = await fake.category.findUnique({ where: { slug: 'apparel-men' } });
      const womenRow = await fake.category.findUnique({ where: { slug: 'apparel-women' } });
      expect(menRow?.sortOrder).toBe(2);
      expect(womenRow?.sortOrder).toBe(1);
      const tree = await service.tree();
      expect(tree[0]?.children.map((child) => child.slug)).toEqual([
        'apparel-women',
        'apparel-men',
      ]);
    });

    it('treats two top-level categories as siblings (both-null parentId)', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      const shoes = await service.create({ nameFa: 'کفش', slug: 'shoes', sortOrder: 2 });

      await expect(service.reorder(apparel.id, { siblingId: shoes.id })).resolves.toBeDefined();
    });

    it('throws BadRequest when the target is not a sibling (child vs top-level)', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      const child = await service.create({
        nameFa: 'مردانه',
        slug: 'apparel-men',
        parentId: apparel.id,
        sortOrder: 1,
      });
      const shoes = await service.create({ nameFa: 'کفش', slug: 'shoes', sortOrder: 2 });

      await expect(service.reorder(child.id, { siblingId: shoes.id })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequest when the target is a child of a different parent', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });
      const shoes = await service.create({ nameFa: 'کفش', slug: 'shoes', sortOrder: 2 });
      const men = await service.create({
        nameFa: 'مردانه',
        slug: 'apparel-men',
        parentId: apparel.id,
        sortOrder: 1,
      });
      const sports = await service.create({
        nameFa: 'ورزشی',
        slug: 'shoes-sports',
        parentId: shoes.id,
        sortOrder: 1,
      });

      await expect(service.reorder(men.id, { siblingId: sports.id })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequest when swapping a category with itself', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });

      await expect(service.reorder(apparel.id, { siblingId: apparel.id })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFound for an unknown category or sibling id', async () => {
      const apparel = await service.create({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 1 });

      await expect(service.reorder('missing-id', { siblingId: apparel.id })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.reorder(apparel.id, { siblingId: 'missing-id' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
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
