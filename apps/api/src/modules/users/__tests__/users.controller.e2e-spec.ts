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
      email: 'admin@monorepo.local',
      name: 'Admin',
      passwordHash: await hash(ADMIN_PASSWORD, 4),
      role: UserRole.ADMIN,
    });
    testApp.prisma.seedUser({
      email: 'user@monorepo.local',
      name: 'User',
      passwordHash: await hash(USER_PASSWORD, 4),
      role: UserRole.USER,
    });

    const adminLogin = await login(app, 'admin@monorepo.local', ADMIN_PASSWORD);
    adminToken = adminLogin.accessToken;
    const userLogin = await login(app, 'user@monorepo.local', USER_PASSWORD);
    userToken = userLogin.accessToken;
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
      .send({ email: 'crud@example.com', name: 'Crud', password: 'super-secret-1' })
      .expect(201);
    const id = created.body.id as string;

    await request(app.getHttpServer())
      .get(`/users/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => expect(res.body.email).toBe('crud@example.com'));

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

  it('rejects non-whitelisted payload fields', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'hacker@example.com', name: 'H', password: 'super-secret-1', role: 'ADMIN' })
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
