import type { INestApplication } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { createTestApp, type TestApp } from '../../../test/utils/create-test-app';

const ADMIN_PASSWORD = 'admin-pass-123';

/**
 * Admin panel Task 05 — /admin/users e2e: the 401/403/200 RBAC surface plus
 * the operational lifecycle (suspend → refresh denied, soft delete stays
 * resolvable, role transitions, session revocation) against the real guard
 * stack and the FakePrisma-backed AppModule.
 */
describe('AdminUsersController (e2e)', () => {
  let app: INestApplication;
  let prisma: TestApp['prisma'];
  let adminToken: string;
  let userToken: string;
  let userRefreshCookie: string;
  let adminId: string;
  let secondAdminId: string;
  let thirdAdminId: string;
  let thirdAdminToken: string;
  let targetUserId: string;
  let deleteOnlyUserId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;

    testApp.prisma.seedUser({
      phone: '09120000000',
      email: 'admin@monorepo.local',
      name: 'Admin',
      passwordHash: await hash(ADMIN_PASSWORD, 4),
      role: UserRole.ADMIN,
    });
    secondAdminId = testApp.prisma.seedUser({
      phone: '09120000003',
      email: 'admin-2@monorepo.local',
      name: 'Admin 2',
      role: UserRole.ADMIN,
    }).id;
    thirdAdminId = testApp.prisma.seedUser({
      phone: '09120000004',
      email: 'admin-3@monorepo.local',
      name: 'Admin 3',
      role: UserRole.ADMIN,
    }).id;
    const regular = testApp.prisma.seedUser({
      phone: '09120000001',
      email: 'user@monorepo.local',
      name: 'User',
      role: UserRole.USER,
    });
    targetUserId = regular.id;
    testApp.prisma.seedProfile({
      userId: regular.id,
      displayName: 'User',
      businessName: 'کسب‌وکار کاربر',
    });
    deleteOnlyUserId = testApp.prisma.seedUser({
      phone: '09120000002',
      email: 'delete-me@monorepo.local',
      name: 'Delete me',
      role: UserRole.USER,
    }).id;

    adminId = (await testApp.prisma.user.findUnique({ where: { email: 'admin@monorepo.local' } }))!
      .id;

    adminToken = await login(app, 'admin@monorepo.local', ADMIN_PASSWORD);
    // Captured while still ACTIVE — the e2e below proves the last-admin guard
    // stops this token after the account is suspended (its refresh is revoked
    // but the short-lived access token would otherwise keep working).
    thirdAdminToken = await otpLogin(app, '09120000004').then((otp) => otp.accessToken);
    const otp = await otpLogin(app, '09120000001');
    userToken = otp.accessToken;
    userRefreshCookie = otp.refreshCookie;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /admin/users requires authentication', async () => {
    await request(app.getHttpServer()).get('/admin/users').expect(401);
  });

  it('GET /admin/users is forbidden for a regular USER (RBAC)', async () => {
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('GET /admin/users lists bounded rows for an ADMIN', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toMatchObject({ page: 1, limit: 20 });
    expect(response.body.total).toBeGreaterThanOrEqual(4);
    for (const item of response.body.items as Record<string, unknown>[]) {
      expect(item).not.toHaveProperty('passwordHash');
      expect(item).not.toHaveProperty('refreshTokens');
    }
  });

  it('GET /admin/users applies the status filter (overview deep-link contract)', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/users?status=SUSPENDED')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body.items).toEqual([]);

    const active = await request(app.getHttpServer())
      .get('/admin/users?status=ACTIVE&q=09120000001')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(active.body.items).toHaveLength(1);
  });

  it('GET /admin/users/:id returns the allowlisted detail for an ADMIN', async () => {
    const response = await request(app.getHttpServer())
      .get(`/admin/users/${targetUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: targetUserId,
      phone: '09120000001',
      profile: { businessName: 'کسب‌وکار کاربر' },
      counts: { lots: 0, dealsAsBuyer: 0, dealsAsSeller: 0 },
    });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('refreshTokens');
  });

  it('rejects the status action without a reason (400) and an unknown action (400)', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/users/${targetUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'SUSPEND' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/admin/users/${targetUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'NUKE', reason: 'اکشن ناشناخته' })
      .expect(400);
  });

  it('runs the suspend → refresh-denied → activate lifecycle end to end', async () => {
    // Suspend with a required reason.
    const suspended = await request(app.getHttpServer())
      .patch(`/admin/users/${targetUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'SUSPEND', reason: 'نقض قوانین پلتفرم' })
      .expect(200);
    expect(suspended.body.status).toBe(UserStatus.SUSPENDED);

    // The revoked refresh session can no longer restore the account.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${userRefreshCookie}`)
      .expect(401);

    // Reactivate.
    const activated = await request(app.getHttpServer())
      .patch(`/admin/users/${targetUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'ACTIVATE', reason: 'رفع مسدودی پس از بررسی' })
      .expect(200);
    expect(activated.body.status).toBe(UserStatus.ACTIVE);
  });

  it('revokes sessions through the dedicated endpoint and audits it', async () => {
    const otp = await otpLogin(app, '09120000001');

    const response = await request(app.getHttpServer())
      .post(`/admin/users/${targetUserId}/revoke-sessions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'نشست‌های مشکوک' })
      .expect(200);
    expect(response.body).toMatchObject({ id: targetUserId, revokedSessions: 1 });

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${otp.refreshCookie}`)
      .expect(401);

    const audits = await request(app.getHttpServer())
      .get('/admin/audit')
      .query({ entityType: 'User', entityId: targetUserId, action: 'user.sessions' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(audits.body.items[0]).toMatchObject({
      actorId: adminId,
      action: 'user.sessions',
      metadata: expect.objectContaining({ reason: 'نشست‌های مشکوک' }),
    });
  });

  it('guards the admin from targeting themselves (409)', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/users/${adminId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'SUSPEND', reason: 'تعلیق خود ممنوع' })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/admin/users/${adminId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: UserRole.USER, reason: 'تنزل خود ممنوع' })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/admin/users/${adminId}/revoke-sessions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'لغو نشست خود ممنوع' })
      .expect(409);
  });

  it('blocks demoting the last active admin (LAST_ADMIN_GUARD) but allows a spare demotion', async () => {
    // Two active admins: demoting the spare one is allowed…
    const spare = await request(app.getHttpServer())
      .patch(`/admin/users/${secondAdminId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: UserRole.USER, reason: 'تنزل مدیر اضافه' })
      .expect(200);
    expect(spare.body.role).toBe(UserRole.USER);

    // …and suspending that demoted admin no longer hits the last-admin guard.
    const suspended = await request(app.getHttpServer())
      .patch(`/admin/users/${secondAdminId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'SUSPEND', reason: 'تعلیق کاربر تنزل‌یافته' })
      .expect(200);
    expect(suspended.body.status).toBe(UserStatus.SUSPENDED);

    // Once the acting admin is the only ACTIVE admin left, the guard (or the
    // self guard, which fires first for the actor) refuses the demotion.
    const response = await request(app.getHttpServer())
      .patch(`/admin/users/${adminId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: UserRole.USER, reason: 'آخرین مدیر هستم' })
      .expect(409);
    expect(response.body.code).toBe('ADMIN_SELF_ACTION_FORBIDDEN');
  });

  it('stops a SUSPENDED admin live access token with LAST_ADMIN_GUARD (409)', async () => {
    // Suspend the third admin (an ACTIVE admin remains, so this is allowed).
    const suspended = await request(app.getHttpServer())
      .patch(`/admin/users/${thirdAdminId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'SUSPEND', reason: 'تعلیق مدیر سوم' })
      .expect(200);
    expect(suspended.body.status).toBe(UserStatus.SUSPENDED);

    // Their short-lived access token still authenticates (the JWT guard does
    // not re-check status per request), but demoting the ONLY remaining active
    // admin hits the last-admin guard, not just the self guard.
    const response = await request(app.getHttpServer())
      .patch(`/admin/users/${adminId}/role`)
      .set('Authorization', `Bearer ${thirdAdminToken}`)
      .send({ role: UserRole.USER, reason: 'تنزل آخرین مدیر با توکن معلق' })
      .expect(409);
    expect(response.body.code).toBe('LAST_ADMIN_GUARD');
  });

  it('runs the BLOCK lifecycle: SUSPENDED→BLOCKED succeeds, BLOCKED→BLOCKED is 400', async () => {
    // BLOCK accepts an already-suspended source (escalation).
    const blocked = await request(app.getHttpServer())
      .patch(`/admin/users/${thirdAdminId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'BLOCK', reason: 'مسدودسازی تخلف جدی' })
      .expect(200);
    expect(blocked.body.status).toBe(UserStatus.BLOCKED);

    // BLOCK from BLOCKED is outside the closed transition table.
    const illegal = await request(app.getHttpServer())
      .patch(`/admin/users/${thirdAdminId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'BLOCK', reason: 'مسدودسازی دوباره' })
      .expect(400);
    expect(illegal.body.code).toBe('ILLEGAL_USER_STATUS_TRANSITION');

    // BLOCK revokes refresh sessions too: a fresh ACTIVE user is blocked and
    // their just-issued refresh cookie can no longer restore the session.
    const blockTarget = prisma.seedUser({ phone: '09120000005', name: 'مسدودشدنی' });
    const session = await otpLogin(app, '09120000005');
    await request(app.getHttpServer())
      .patch(`/admin/users/${blockTarget.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'BLOCK', reason: 'مسدودسازی با لغو نشست' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${session.refreshCookie}`)
      .expect(401);
  });

  it('soft-deletes: DELETED status remains resolvable by id and is terminal', async () => {
    const deleted = await request(app.getHttpServer())
      .patch(`/admin/users/${deleteOnlyUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'DELETE', reason: 'حذف نرم آزمایشی' })
      .expect(200);
    expect(deleted.body.status).toBe(UserStatus.DELETED);
    expect(deleted.body.deletedAt).not.toBeNull();

    await request(app.getHttpServer())
      .get(`/admin/users/${deleteOnlyUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/admin/users/${deleteOnlyUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'ACTIVATE', reason: 'احیای حساب حذف‌شده' })
      .expect(400);
  });

  it('writes the reason onto every audited user mutation', async () => {
    const audits = await request(app.getHttpServer())
      .get('/admin/audit')
      .query({ entityType: 'User', entityId: targetUserId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const items = audits.body.items as Array<{ metadata: Record<string, unknown> }>;
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const item of items) {
      expect(typeof item.metadata.reason).toBe('string');
      expect((item.metadata.reason as string).length).toBeGreaterThan(0);
    }
  });

  it('the legacy PATCH/DELETE /users/:id routes are gone (404)', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${targetUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/users/${targetUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
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

interface OtpSession {
  accessToken: string;
  refreshCookie: string;
}

/** Non-admin session via OTP dev mode (AUTH-003); captures the refresh cookie. */
async function otpLogin(app: INestApplication, phone: string): Promise<OtpSession> {
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
  const cookies = verified.headers['set-cookie'] ?? [];
  const cookieLine = Array.isArray(cookies) ? cookies[0] : cookies;
  const refreshCookie = cookieLine?.split(';')[0]?.split('=')[1] ?? '';
  return { accessToken: verified.body.accessToken as string, refreshCookie };
}
