import type { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { createTestApp } from '../../../test/utils/create-test-app';

const ADMIN_PASSWORD = 'admin-pass-123';
const USER_PASSWORD = 'user-pass-1234';

/**
 * Admin write API for the taxonomy (CAT-004): POST /admin/categories,
 * PATCH /admin/categories/:id (name/slug/parent/isActive toggle),
 * PATCH /admin/categories/:id/reorder (sibling sortOrder swap).
 * RBAC matrix + happy paths + 409/400/404 error paths.
 */
describe('CategoriesAdminController (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  let apparelId: string;
  let apparelMenId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    testApp.prisma.seedUser({
      phone: '09120000000',
      email: 'admin@monorepo.local',
      name: 'Admin',
      passwordHash: await hash(ADMIN_PASSWORD, 4),
      role: UserRole.ADMIN,
    });
    testApp.prisma.seedUser({
      phone: '09120000001',
      email: 'user@monorepo.local',
      name: 'User',
      passwordHash: await hash(USER_PASSWORD, 4),
      role: UserRole.USER,
    });

    // Fixed taxonomy: apparel (sortOrder 2) with two children, shoes (1).
    const apparel = testApp.prisma.seedCategory({
      nameFa: 'پوشاک',
      slug: 'apparel',
      sortOrder: 2,
    });
    apparelId = apparel.id;
    apparelMenId = testApp.prisma.seedCategory({
      nameFa: 'مردانه',
      slug: 'apparel-men',
      parentId: apparel.id,
      sortOrder: 1,
    }).id;
    testApp.prisma.seedCategory({
      nameFa: 'زنانه',
      slug: 'apparel-women',
      parentId: apparel.id,
      sortOrder: 2,
    });
    testApp.prisma.seedCategory({ nameFa: 'کفش', slug: 'shoes', sortOrder: 1 });

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@monorepo.local', password: ADMIN_PASSWORD });
    if (adminLogin.status !== 200) {
      throw new Error(
        `admin login failed: ${adminLogin.status} ${JSON.stringify(adminLogin.body)}`,
      );
    }
    adminToken = adminLogin.body.accessToken as string;
    // Non-admin sessions come from the OTP flow (password login is ADMIN-only).
    userToken = await otpLogin(app, '09120000001');
  });

  afterAll(async () => {
    await app.close();
  });

  // --- RBAC ---

  it('POST /admin/categories requires authentication (401 anonymous)', async () => {
    await request(app.getHttpServer())
      .post('/admin/categories')
      .send({ nameFa: 'پوشاک', slug: 'anonymous-create' })
      .expect(401);
  });

  it('admin endpoints are forbidden for a non-admin USER (403)', async () => {
    await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ nameFa: 'پوشاک', slug: 'user-create' })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/admin/categories/whatever-id')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ nameFa: 'هک' })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/admin/categories/whatever-id/reorder')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ siblingId: 'other-id' })
      .expect(403);
  });

  // --- POST /admin/categories ---

  it('creates a top-level category and returns the admin response shape', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'زیبایی و بهداشتی', nameEn: 'Beauty', slug: 'beauty-health', sortOrder: 5 })
      .expect(201);

    expect(response.body).toMatchObject({
      nameFa: 'زیبایی و بهداشتی',
      nameEn: 'Beauty',
      slug: 'beauty-health',
      parentId: null,
      sortOrder: 5,
      isActive: true,
    });
    expect(typeof response.body.id).toBe('string');
    // Allowlisted admin shape — exactly these fields.
    expect(Object.keys(response.body).sort()).toEqual([
      'id',
      'isActive',
      'nameEn',
      'nameFa',
      'parentId',
      'slug',
      'sortOrder',
    ]);
  });

  it('creates a child under a top-level parent', async () => {
    const parent = await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'خانه و لوازم خانگی', slug: 'home-kitchen', sortOrder: 6 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nameFa: 'آشپزخانه',
        slug: 'home-kitchen-kitchenware',
        parentId: parent.body.id as string,
      })
      .expect(201);

    expect(response.body.parentId).toBe(parent.body.id);
    // sortOrder omitted → append after siblings (first child → 0).
    expect(response.body.sortOrder).toBe(0);
  });

  it('rejects slug clashes with 409 (seeded taxonomy)', async () => {
    await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'پوشاک دیگر', slug: 'apparel' })
      .expect(409);
  });

  it('rejects an unknown parentId with 404', async () => {
    await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'یتیم', slug: 'orphan', parentId: 'missing-parent-id' })
      .expect(404);
  });

  it('rejects nesting under a level-2 parent with 400 (depth ≤ 2)', async () => {
    await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nameFa: 'تی‌شرت',
        slug: 'apparel-men-tshirt',
        parentId: apparelMenId,
      })
      .expect(400);
  });

  it('rejects invalid payloads with 400 (bad slug shape, short nameFa)', async () => {
    await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'پوشاک', slug: 'Not Kebab!' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'پ', slug: 'short-name' })
      .expect(400);
  });

  // --- PATCH /admin/categories/:id ---

  it('updates nameFa/nameEn partially', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'کالا مصرفی', nameEn: 'FMCG', slug: 'fmcg', sortOrder: 7 })
      .expect(201);
    const id = created.body.id as string;

    const response = await request(app.getHttpServer())
      .patch(`/admin/categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'کالا مصرفی FMCG' })
      .expect(200);

    expect(response.body).toMatchObject({ id, nameFa: 'کالا مصرفی FMCG', nameEn: 'FMCG' });
  });

  it('renames a slug and rejects clashing slugs with 409', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'عطر', slug: 'perfume', sortOrder: 8 })
      .expect(201);
    const id = created.body.id as string;

    await request(app.getHttpServer())
      .patch(`/admin/categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: 'perfume-ir' })
      .expect(200)
      .expect((res) => expect(res.body.slug).toBe('perfume-ir'));

    await request(app.getHttpServer())
      .patch(`/admin/categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: 'shoes' })
      .expect(409);
  });

  it('re-parents a child under another top-level category', async () => {
    const parentA = await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'والد الف', slug: 'reparent-a', sortOrder: 9 })
      .expect(201);
    const parentB = await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'والد ب', slug: 'reparent-b', sortOrder: 10 })
      .expect(201);
    const child = await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nameFa: 'فرزند',
        slug: 'reparent-child',
        parentId: parentA.body.id as string,
      })
      .expect(201);

    const moved = await request(app.getHttpServer())
      .patch(`/admin/categories/${child.body.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ parentId: parentB.body.id })
      .expect(200);

    expect(moved.body.parentId).toBe(parentB.body.id);
  });

  it('rejects moving a parent under a parent with 400 (top-level target only)', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/categories/${apparelId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ parentId: apparelMenId })
      .expect(400);
  });

  it('rejects unknown category ids with 404', async () => {
    await request(app.getHttpServer())
      .patch('/admin/categories/missing-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'نام جدید' })
      .expect(404);
  });

  it('deactivates via isActive: false — hidden from the public tree, no delete endpoint', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'مخفی ادمین', slug: 'deactivate-me', sortOrder: 11 })
      .expect(201);
    const id = created.body.id as string;

    await request(app.getHttpServer())
      .patch(`/admin/categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200)
      .expect((res) => expect(res.body.isActive).toBe(false));

    const tree = await request(app.getHttpServer()).get('/categories').expect(200);
    const slugs = (tree.body as { slug: string; children: { slug: string }[] }[]).flatMap(
      (node) => [node.slug, ...node.children.map((child) => child.slug)],
    );
    expect(slugs).not.toContain('deactivate-me');

    // The card defines no DELETE — deactivation is the lifecycle.
    await request(app.getHttpServer())
      .delete(`/admin/categories/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  // --- PATCH /admin/categories/:id/reorder ---

  it('swaps sortOrder with a sibling (top-level and under a parent)', async () => {
    const a = await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'رتبه الف', slug: 'order-a', sortOrder: 20 })
      .expect(201);
    const b = await request(app.getHttpServer())
      .post('/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nameFa: 'رتبه ب', slug: 'order-b', sortOrder: 21 })
      .expect(201);

    const first = await request(app.getHttpServer())
      .patch(`/admin/categories/${a.body.id as string}/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ siblingId: b.body.id })
      .expect(200);
    expect(first.body.sortOrder).toBe(21);

    // Swapping a↔b again returns a to 20 — only possible if the first swap
    // actually gave b a's original 20 (both sides exchanged, not overwritten).
    const second = await request(app.getHttpServer())
      .patch(`/admin/categories/${a.body.id as string}/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ siblingId: b.body.id })
      .expect(200);
    expect(second.body.sortOrder).toBe(20);
  });

  it('reorders children within one parent via sibling swap', async () => {
    const men = await request(app.getHttpServer())
      .get('/categories')
      .expect(200)
      .then((res) =>
        (res.body as { slug: string; children: { id: string; slug: string }[] }[]).find(
          (node) => node.slug === 'apparel',
        ),
      );
    const menChild = men?.children.find((child) => child.slug === 'apparel-men');
    const womenChild = men?.children.find((child) => child.slug === 'apparel-women');
    expect(menChild).toBeDefined();
    expect(womenChild).toBeDefined();

    const response = await request(app.getHttpServer())
      .patch(`/admin/categories/${womenChild!.id}/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ siblingId: menChild!.id })
      .expect(200);

    // women had sortOrder 2, men 1 → women takes men's 1 (tree order flips).
    expect(response.body.sortOrder).toBe(1);
    const tree = await request(app.getHttpServer()).get('/categories').expect(200);
    const apparel = (tree.body as { slug: string; children: { slug: string }[] }[]).find(
      (node) => node.slug === 'apparel',
    );
    expect(apparel?.children.map((child) => child.slug)).toEqual(['apparel-women', 'apparel-men']);
  });

  it('rejects reorder with a non-sibling target (400) and unknown ids (404)', async () => {
    // Top-level vs child under apparel → different parents.
    const shoes = await request(app.getHttpServer())
      .get('/categories')
      .expect(200)
      .then((res) =>
        (res.body as { id: string; slug: string }[]).find((node) => node.slug === 'shoes'),
      );

    await request(app.getHttpServer())
      .patch(`/admin/categories/${apparelMenId}/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ siblingId: shoes!.id })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/admin/categories/${apparelMenId}/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ siblingId: 'missing-sibling-id' })
      .expect(404);

    await request(app.getHttpServer())
      .patch('/admin/categories/missing-id/reorder')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ siblingId: apparelMenId })
      .expect(404);
  });
});

/** Non-admin session via OTP dev mode (AUTH-003: password login is ADMIN-only). */
async function otpLogin(app: INestApplication, phone: string): Promise<string> {
  const issued = await request(app.getHttpServer()).post('/auth/otp/request').send({ phone });
  if (issued.status !== 200 || typeof issued.body.devCode !== 'string') {
    throw new Error(
      `otp request failed for ${phone}: ${issued.status} ${JSON.stringify(issued.body)}`,
    );
  }
  const verified = await request(app.getHttpServer())
    .post('/auth/otp/verify')
    .send({ phone, code: issued.body.devCode });
  if (verified.status !== 200) {
    throw new Error(
      `otp verify failed for ${phone}: ${verified.status} ${JSON.stringify(verified.body)}`,
    );
  }
  return verified.body.accessToken as string;
}
