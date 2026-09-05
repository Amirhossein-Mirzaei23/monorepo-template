import type { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { createTestApp } from '../../../test/utils/create-test-app';

const ADMIN_PASSWORD = 'admin-pass-123';
const USER_PASSWORD = 'user-pass-1234';

describe('UsersController (e2e)', () => {
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
      passwordHash: await hash(USER_PASSWORD, 4),
      role: UserRole.USER,
    });

    const adminLogin = await login(app, 'admin@monorepo.local', ADMIN_PASSWORD);
    adminToken = adminLogin.accessToken;
    // Non-admin sessions come from the OTP flow now that password login is
    // ADMIN-only (AUTH-003); OTP_DEV_MODE echoes the code in the response.
    userToken = await otpLogin(app, '09120000001');
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /users requires authentication', async () => {
    await request(app.getHttpServer()).get('/users').expect(401);
  });

  it('GET /users is forbidden for non-admins (RBAC)', async () => {
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('GET /users lists users with pagination envelope for admins', async () => {
    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      page: 1,
      limit: 20,
      total: expect.any(Number),
    });
    expect(Array.isArray(response.body.items)).toBe(true);
    for (const item of response.body.items as Record<string, unknown>[]) {
      expect(item).not.toHaveProperty('passwordHash');
    }
  });

  it('CRUD round trip: create → read → update → delete', async () => {
    const created = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: '09129990001', name: 'Crud', password: 'super-secret-1' })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body.phone).toBe('09129990001');
    expect(created.body.email).toBeNull();
    expect(created.body.status).toBe('ACTIVE');
    expect(created.body.accountRoles).toEqual([]);

    await request(app.getHttpServer())
      .get(`/users/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => expect(res.body.phone).toBe('09129990001'));

    await request(app.getHttpServer())
      .patch(`/users/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Crud Renamed' })
      .expect(200)
      .expect((res) => expect(res.body.name).toBe('Crud Renamed'));

    await request(app.getHttpServer())
      .delete(`/users/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/users/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('rejects malformed phone numbers with 400', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: 'not-a-phone', name: 'Bad', password: 'super-secret-1' })
      .expect(400);
  });

  it('rejects non-whitelisted payload fields', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        phone: '09129990002',
        name: 'H',
        password: 'super-secret-1',
        role: 'ADMIN',
      })
      // role is whitelisted (enum) but `isAdmin` sneaking through must be rejected
      .expect((res) => {
        if ('isAdmin' in res.body) throw new Error('non-whitelisted field leaked through');
      });
  });

  it('rejects invalid sort fields', async () => {
    await request(app.getHttpServer())
      .get('/users?sort=passwordHash')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('rejects limit above the max', async () => {
    await request(app.getHttpServer())
      .get('/users?limit=500')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});

async function login(
  app: INestApplication,
  email: string,
  password: string,
): Promise<{ accessToken: string }> {
  const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(
      `login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }
  return response.body as { accessToken: string };
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
