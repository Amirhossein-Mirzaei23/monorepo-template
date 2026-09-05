import type { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { createTestApp } from '../../../test/utils/create-test-app';
import { REFRESH_COOKIE_NAME } from '../auth.constants';

const ADMIN_PASSWORD = 'admin-pass-123';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns an access token and sets the httpOnly refresh cookie', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@monorepo.local', password: ADMIN_PASSWORD })
        .expect(200);

      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.user.phone).toBe('09120000000');
      expect(response.body.user.email).toBe('admin@monorepo.local');
      expect(response.body).not.toHaveProperty('refreshToken');

      const setCookie = response.headers['set-cookie'] as unknown as string[];
      const refreshCookie = setCookie.find((cookie) =>
        cookie.startsWith(`${REFRESH_COOKIE_NAME}=`),
      );
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toMatch(/httponly/i);
    });

    it('rejects bad credentials with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@monorepo.local', password: 'wrong' })
        .expect(401);
    });

    it('validates the payload with 400 for malformed email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'whatever' })
        .expect(400);
    });
  });

  describe('POST /auth/register', () => {
    it('creates a user and returns a session', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ phone: '09123334444', name: 'Newbie', password: 'super-secret-1' })
        .expect(201);

      expect(response.body.user.phone).toBe('09123334444');
      expect(response.body.user.email).toBeNull();
      expect(response.body.user.role).toBe(UserRole.USER);
      expect(response.body.user.status).toBe('ACTIVE');
      expect(response.body.user.accountRoles).toEqual([]);
    });

    it('rejects weak passwords with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ phone: '09123334445', name: 'Weak', password: 'short' })
        .expect(400);
    });

    it('rejects malformed phone numbers with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ phone: '12345', name: 'Bad Phone', password: 'super-secret-1' })
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the profile for a valid access token', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@monorepo.local', password: ADMIN_PASSWORD });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken as string}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.phone).toBe('09120000000');
          expect(res.body.email).toBe('admin@monorepo.local');
          expect(res.body.status).toBe('ACTIVE');
          expect(res.body.accountRoles).toEqual([]);
        });
    });

    it('requires authentication (401 without token)', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });
  });

  describe('refresh rotation over HTTP', () => {
    it('rotates the cookie and invalidates the previous one', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@monorepo.local', password: ADMIN_PASSWORD });
      const cookie = extractCookie(login.headers['set-cookie']);

      const refreshed = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);
      expect(refreshed.body.accessToken).toEqual(expect.any(String));
      const rotatedCookie = extractCookie(refreshed.headers['set-cookie']);

      // Replaying the first cookie must fail (reuse detection)…
      await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie).expect(401);
      // …and after reuse detection the whole family is revoked.
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', rotatedCookie)
        .expect(401);
    });

    it('returns 401 when no refresh cookie is presented', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session and clears the cookie', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@monorepo.local', password: ADMIN_PASSWORD });
      const cookie = extractCookie(login.headers['set-cookie']);

      const logout = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', cookie)
        .expect(204);
      expect(String(logout.headers['set-cookie'] ?? '')).toContain(`${REFRESH_COOKIE_NAME}=;`);

      await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie).expect(401);
    });
  });
});

function extractCookie(setCookie: unknown): string {
  const entries = Array.isArray(setCookie) ? (setCookie as string[]) : [String(setCookie)];
  const refresh = entries.find((cookie) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!refresh) {
    throw new Error('refresh cookie missing in test response');
  }
  return refresh.split(';')[0] as string;
}
