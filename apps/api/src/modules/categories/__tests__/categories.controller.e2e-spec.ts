import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../../../test/utils/create-test-app';

/**
 * GET /categories is the only public surface of this module (CAT-001; CAT-002
 * folded in). Admin writes are CAT-004 and will get their own e2e suite.
 */
describe('CategoriesController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;

    // Fixed taxonomy: roots apparel (sortOrder 2) and shoes (1, inactive
    // hidden-root 3); children under apparel ordered by sortOrder.
    const apparel = testApp.prisma.seedCategory({ nameFa: 'پوشاک', slug: 'apparel', sortOrder: 2 });
    const shoes = testApp.prisma.seedCategory({ nameFa: 'کفش', slug: 'shoes', sortOrder: 1 });
    testApp.prisma.seedCategory({
      nameFa: 'مردانه',
      slug: 'apparel-men',
      parentId: apparel.id,
      sortOrder: 1,
    });
    testApp.prisma.seedCategory({
      nameFa: 'زنانه',
      slug: 'apparel-women',
      parentId: apparel.id,
      sortOrder: 2,
    });
    testApp.prisma.seedCategory({
      nameFa: 'ورزشی',
      slug: 'shoes-sports',
      parentId: shoes.id,
      sortOrder: 1,
    });
    testApp.prisma.seedCategory({
      nameFa: 'مخفی',
      slug: 'hidden-root',
      sortOrder: 3,
      isActive: false,
    });
    testApp.prisma.seedCategory({
      nameFa: 'مخفی‌فرزند',
      slug: 'hidden-child',
      parentId: apparel.id,
      sortOrder: 3,
      isActive: false,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /categories is public — no Authorization header required', async () => {
    const response = await request(app.getHttpServer()).get('/categories').expect(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(2);
  });

  it('returns the nested two-level tree ordered by sortOrder then nameFa', async () => {
    const response = await request(app.getHttpServer()).get('/categories').expect(200);
    const tree = response.body as {
      slug: string;
      children: { slug: string }[];
    }[];

    expect(tree.map((node) => node.slug)).toEqual(['shoes', 'apparel']);
    expect(tree[0]?.children.map((child) => child.slug)).toEqual(['shoes-sports']);
    expect(tree[1]?.children.map((child) => child.slug)).toEqual(['apparel-men', 'apparel-women']);
  });

  it('hides inactive categories at both levels', async () => {
    const response = await request(app.getHttpServer()).get('/categories').expect(200);
    const slugs = (response.body as { slug: string; children: { slug: string }[] }[]).flatMap(
      (node) => [node.slug, ...node.children.map((child) => child.slug)],
    );

    expect(slugs).not.toContain('hidden-root');
    expect(slugs).not.toContain('hidden-child');
  });

  it('exposes only the public node fields (no sortOrder/isActive/parentId)', async () => {
    const response = await request(app.getHttpServer()).get('/categories').expect(200);
    const nodes = [
      ...(response.body as Record<string, unknown>[]),
      ...(response.body as { children: Record<string, unknown>[] }[]).flatMap(
        (node) => node.children,
      ),
    ];
    for (const node of nodes) {
      expect(Object.keys(node).sort()).toEqual(['children', 'id', 'nameEn', 'nameFa', 'slug']);
    }
  });
});
