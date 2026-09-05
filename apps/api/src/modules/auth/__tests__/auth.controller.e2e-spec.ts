import type { INestApplication } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import type { FakePrisma } from '../../../test/fakes/fake-prisma';
import { createTestApp } from '../../../test/utils/create-test-app';
import { REFRESH_COOKIE_NAME } from '../auth.constants';

const ADMIN_PASSWORD = 'admin-pass-123';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  /** Hands out unique client IPs so per-IP @Throttle buckets stay isolated per test. */
  let ipCounter = 0;
  const nextIp = (): string => `10.0.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    prisma.seedUser({
      phone: '09120000000',
      email: 'admin@monorepo.local',
      name: 'Admin',
      passwordHash: await hash(ADMIN_PASSWORD, 4),
      role: UserRole.ADMIN,
    });
    prisma.seedUser({
      phone: '09120000001',
      email: 'legacy@monorepo.local',
      name: 'Legacy',
      passwordHash: await hash('legacy-pass-123', 4),
      role: UserRole.USER,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  /** Requests a code (OTP_DEV_MODE echoes it) with a fresh throttle bucket. */
  async function issueDevCode(phone: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .set('X-Forwarded-For', nextIp())
      .send({ phone })
      .expect(200);
    const code = response.body.devCode as string | undefined;
    if (!code || !/^\d{6}$/.test(code)) {
      throw new Error(`dev code missing for ${phone} — OTP_DEV_MODE not enabled?`);
    }
    return code;
  }

  describe('POST /auth/login (ADMIN-only)', () => {
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

    it('rejects non-admin password logins with 403 + code (AUTH-003)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'legacy@monorepo.local', password: 'legacy-pass-123' })
        .expect(403);
      expect(response.body.code).toBe('ADMIN_ONLY_LOGIN');
    });
  });

  describe('POST /auth/otp/request', () => {
    it('returns the code expiry (and the code itself in OTP dev mode)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/otp/request')
        .set('X-Forwarded-For', nextIp())
        .send({ phone: '09121111101' })
        .expect(200);

      expect(response.body.expiresAt).toEqual(expect.any(String));
      expect(new Date(response.body.expiresAt as string).getTime()).toBeGreaterThan(Date.now());
      expect(response.body.devCode).toMatch(/^\d{6}$/);
    });

    it('rejects malformed phones with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/otp/request')
        .set('X-Forwarded-For', nextIp())
        .send({ phone: '12345' })
        .expect(400);
    });

    it('surfaces the per-phone send cap as 429 TOO_MANY_REQUESTS with a retry hint', async () => {
      const phone = '09121111199';
      // Distinct IPs per call so the route throttle stays out of the picture.
      for (let i = 0; i < 3; i += 1) {
        await request(app.getHttpServer())
          .post('/auth/otp/request')
          .set('X-Forwarded-For', nextIp())
          .send({ phone })
          .expect(200);
      }

      const response = await request(app.getHttpServer())
        .post('/auth/otp/request')
        .set('X-Forwarded-For', nextIp())
        .send({ phone })
        .expect(429);

      expect(response.body.code).toBe('TOO_MANY_REQUESTS');
      expect(response.body.retryAfterSeconds).toBeGreaterThan(0);
      expect(response.headers['retry-after']).toEqual(expect.any(String));
    });

    it('enforces the stricter per-route throttle (5/min/IP)', async () => {
      const ip = '10.9.9.9';
      const phones = ['09121111201', '09121111202', '09121111203', '09121111204', '09121111205'];
      for (const phone of phones) {
        await request(app.getHttpServer())
          .post('/auth/otp/request')
          .set('X-Forwarded-For', ip)
          .send({ phone })
          .expect(200);
      }

      const blocked = await request(app.getHttpServer())
        .post('/auth/otp/request')
        .set('X-Forwarded-For', ip)
        .send({ phone: '09121111206' })
        .expect(429);
      expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
      expect(blocked.headers['retry-after']).toEqual(expect.any(String));
    });
  });

  describe('POST /auth/otp/verify', () => {
    it('logs a first-time user in and registers the account', async () => {
      const phone = '09121111102';
      const code = await issueDevCode(phone);

      const response = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone, code })
        .expect(200);

      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.user.phone).toBe(phone);
      expect(response.body.user.name).toMatch(/^کاربر /);
      expect(response.body.user.status).toBe('ACTIVE');
      expect(response.body.user.accountRoles).toEqual([]);
      // ONB-001: real check — a fresh user is routed to /onboarding.
      expect(response.body.onboardingCompleted).toBe(false);
      expect(response.body).not.toHaveProperty('refreshToken');

      const setCookie = response.headers['set-cookie'] as unknown as string[];
      const refreshCookie = setCookie.find((cookie) =>
        cookie.startsWith(`${REFRESH_COOKIE_NAME}=`),
      );
      expect(refreshCookie).toMatch(/httponly/i);

      // The OTP session is a real session: /auth/me resolves the user.
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${response.body.accessToken as string}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.phone).toBe(phone);
        });
    });

    it('logs an existing user into their own account (no duplicate rows)', async () => {
      const phone = '09121111103';
      prisma.seedUser({ phone, name: 'Ali' });
      const code = await issueDevCode(phone);

      const response = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone, code })
        .expect(200);
      expect(response.body.user.name).toBe('Ali');

      const count = await prisma.user.count({ where: { phone } });
      expect(count).toBe(1);
    });

    it('rejects a second verify with the same (consumed) code', async () => {
      const phone = '09121111104';
      const code = await issueDevCode(phone);

      await request(app.getHttpServer()).post('/auth/otp/verify').send({ phone, code }).expect(200);
      await request(app.getHttpServer()).post('/auth/otp/verify').send({ phone, code }).expect(401);
    });

    it('rejects a wrong code with 401 and a machine-readable code', async () => {
      const phone = '09121111105';
      await issueDevCode(phone);

      const response = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone, code: '000000' })
        .expect(401);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('locks the code after too many wrong attempts (LOCKED)', async () => {
      const phone = '09121111106';
      const code = await issueDevCode(phone);
      const wrong = code === '000000' ? '000001' : '000000';

      for (let i = 0; i < 5; i += 1) {
        await request(app.getHttpServer())
          .post('/auth/otp/verify')
          .send({ phone, code: wrong })
          .expect(401);
      }

      // Even the correct code is refused while the row is locked.
      const response = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone, code })
        .expect(401);
      expect(response.body.code).toBe('LOCKED');
    });

    it.each<[UserStatus, string, string]>([
      [UserStatus.SUSPENDED, '09121111117', 'ACCOUNT_SUSPENDED'],
      [UserStatus.BLOCKED, '09121111118', 'ACCOUNT_BLOCKED'],
      [UserStatus.DELETED, '09121111119', 'ACCOUNT_DELETED'],
    ])('rejects a %s account with 403 + code', async (status, phone, expectedCode) => {
      prisma.seedUser({ phone, name: 'Restricted', status });
      const code = await issueDevCode(phone);

      const response = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone, code })
        .expect(403);
      expect(response.body.code).toBe(expectedCode);
    });

    it('rejects malformed payloads with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone: '09121111110', code: 'abc' })
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
