import type { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import type { FakePrisma } from '../../../test/fakes/fake-prisma';
import { createTestApp } from '../../../test/utils/create-test-app';

describe('GET /admin/audit (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  let adminToken: string;
  let userToken: string;
  let adminId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    const admin = prisma.seedUser({
      phone: '09121110000',
      email: 'audit-admin@monorepo.local',
      name: 'Audit Admin',
      passwordHash: await hash('admin-pass-123', 4),
      role: UserRole.ADMIN,
    });
    adminId = admin.id;
    prisma.seedUser({ phone: '09121110001', name: 'Regular User', role: UserRole.USER });
    adminToken = await login(app, 'audit-admin@monorepo.local', 'admin-pass-123');
    userToken = await otpLogin(app, '09121110001');

    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'category.update',
        entityType: 'Category',
        entityId: 'category-1',
        metadata: { changedFields: ['nameFa'] },
        requestId: 'audit-r1',
        ip: '203.0.113.10',
        createdAt: new Date('2026-09-19T10:00:00.000Z'),
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'category.create',
        entityType: 'Category',
        entityId: 'category-2',
        metadata: { sortOrder: 2 },
        requestId: 'audit-r2',
        ip: '203.0.113.11',
        createdAt: new Date('2026-09-20T10:00:00.000Z'),
      },
    });
  });

  afterAll(async () => app.close());

  it('returns 401 for an anonymous request', async () => {
    await request(app.getHttpServer()).get('/admin/audit').expect(401);
  });

  it('returns 403 for an authenticated USER', async () => {
    await request(app.getHttpServer())
      .get('/admin/audit')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('returns an ADMIN-only paginated response filtered by actor/action/entity/date', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/audit')
      .query({
        page: 1,
        limit: 1,
        actorId: adminId,
        action: 'category.update',
        entityType: 'Category',
        entityId: 'category-1',
        from: '2026-09-19T00:00:00.000Z',
        to: '2026-09-19T23:59:59.999Z',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({ total: 1, page: 1, limit: 1 });
    expect(response.body.items).toEqual([
      expect.objectContaining({
        actorId: adminId,
        action: 'category.update',
        entityType: 'Category',
        entityId: 'category-1',
        requestId: 'audit-r1',
      }),
    ]);
  });

  it('rejects an inverted date range with 400', async () => {
    await request(app.getHttpServer())
      .get('/admin/audit')
      .query({ from: '2026-09-21T00:00:00.000Z', to: '2026-09-20T00:00:00.000Z' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});

async function login(app: INestApplication, email: string, password: string): Promise<string> {
  const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
  if (response.status !== 200) throw new Error(`login failed: ${response.status}`);
  return response.body.accessToken as string;
}

async function otpLogin(app: INestApplication, phone: string): Promise<string> {
  const issued = await request(app.getHttpServer()).post('/auth/otp/request').send({ phone });
  const verified = await request(app.getHttpServer())
    .post('/auth/otp/verify')
    .send({ phone, code: issued.body.devCode });
  if (verified.status !== 200) throw new Error(`otp login failed: ${verified.status}`);
  return verified.body.accessToken as string;
}
