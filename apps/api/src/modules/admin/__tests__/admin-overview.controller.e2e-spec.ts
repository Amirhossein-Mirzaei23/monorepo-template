import type { INestApplication } from '@nestjs/common';
import { LotStatus, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { createTestApp } from '../../../test/utils/create-test-app';

const ADMIN_PASSWORD = 'admin-pass-123';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('AdminOverviewController (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;

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
      role: UserRole.USER,
    });
    testApp.prisma.seedUser({
      phone: '09120000002',
      name: 'Suspended',
      status: 'SUSPENDED',
    });

    // One queued lot plus noise from other statuses.
    const base = Date.now() - 5 * DAY_MS;
    testApp.prisma.seedLot({
      sellerId: '09120000001',
      categoryId: 'cat-1',
      title: 'لات در انتظار بررسی',
      quantity: 1,
      availableQuantity: 1,
      minOrderQuantity: 1,
      pricingType: 'FIXED',
      totalPrice: 1000,
      unitPrice: 1000,
      condition: 'NEW',
      liquidationReason: 'OVERSTOCK',
      province: 'tehran',
      city: 'tehran',
      expiresAt: new Date(base + 30 * DAY_MS),
      status: LotStatus.PENDING_REVIEW,
      createdAt: new Date(base),
    });
    testApp.prisma.seedLot({
      sellerId: '09120000001',
      categoryId: 'cat-1',
      title: 'لات فعال',
      quantity: 1,
      availableQuantity: 1,
      minOrderQuantity: 1,
      pricingType: 'FIXED',
      totalPrice: 1000,
      unitPrice: 1000,
      condition: 'NEW',
      liquidationReason: 'OVERSTOCK',
      province: 'tehran',
      city: 'tehran',
      expiresAt: new Date(base + 30 * DAY_MS),
      status: LotStatus.ACTIVE,
      createdAt: new Date(base - DAY_MS),
    });

    adminToken = await login(app, 'admin@monorepo.local', ADMIN_PASSWORD);
    userToken = await otpLogin(app, '09120000001');
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /admin/overview requires authentication', async () => {
    await request(app.getHttpServer()).get('/admin/overview').expect(401);
  });

  it('GET /admin/overview is forbidden for a regular USER (RBAC)', async () => {
    await request(app.getHttpServer())
      .get('/admin/overview')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('GET /admin/overview returns the bounded workload payload for an ADMIN', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toEqual({
      counts: {
        pendingReviewLots: 1,
        openReports: 0,
        pendingVerifications: 0,
        disputedDeals: 0,
        activeUsers: 2,
        suspendedUsers: 1,
        blockedUsers: 0,
        newUsersLast7Days: 3,
      },
      oldestPendingLots: [
        {
          id: expect.any(String),
          code: expect.any(String),
          title: 'لات در انتظار بررسی',
          status: 'PENDING_REVIEW',
          createdAt: expect.any(String),
        },
      ],
      oldestOpenReports: [],
    });
  });
});

async function login(app: INestApplication, email: string, password: string): Promise<string> {
  const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(
      `login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }
  return response.body.accessToken as string;
}

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
