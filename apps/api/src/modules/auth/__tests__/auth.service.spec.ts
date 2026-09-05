import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OtpPurpose, UserRole, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { SmsClientType } from '../../sms/sms.constants';
import { UsersRepository } from '../../users/users.repository';
import { AUTH_ERROR_CODES } from '../auth.constants';
import { AuthService } from '../auth.service';
import { TokenService } from '../token.service';

const ADMIN_PASSWORD = 'admin-pass-123';

/** Runs fn, fails the test unless it rejects, and returns the thrown error. */
async function rejected<T = Error>(fn: () => Promise<unknown>): Promise<T> {
  try {
    await fn();
  } catch (error) {
    return error as T;
  }
  throw new Error('expected fn to reject');
}

/** OtpService stand-in: records calls; verification can be told to fail. */
class FakeOtpService {
  readonly requests: Array<{ phone: string; clientType?: SmsClientType }> = [];
  verifyFailure: UnauthorizedException | null = null;

  async request(phone: string, _purpose: OtpPurpose, clientType?: SmsClientType) {
    this.requests.push({ phone, clientType });
    return { expiresAt: new Date(Date.now() + 120_000) };
  }

  async verify(_phone: string, _code: string): Promise<{ ok: true }> {
    if (this.verifyFailure) {
      throw this.verifyFailure;
    }
    return { ok: true };
  }
}

describe('AuthService', () => {
  let auth: AuthService;
  let fake: FakePrisma;
  let otp: FakeOtpService;

  beforeEach(() => {
    fake = new FakePrisma();
    otp = new FakeOtpService();
    const repository = new UsersRepository(fake as unknown as PrismaService);
    const config = new ConfigService({
      app: {
        jwt: {
          accessSecret: process.env.JWT_ACCESS_SECRET ?? 'unit-test-access-secret',
          refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'unit-test-refresh-secret',
          accessTtl: '15m',
          refreshTtl: '30d',
        },
      },
    });
    const tokens = new TokenService(new JwtService({}), config, fake as unknown as PrismaService);
    auth = new AuthService(repository, tokens, fake as unknown as PrismaService, otp as never);
  });

  const seedAdmin = async (status: UserStatus = UserStatus.ACTIVE) =>
    fake.seedUser({
      phone: '09120000000',
      email: 'admin@monorepo.local',
      name: 'Admin',
      passwordHash: await hash(ADMIN_PASSWORD, 4),
      role: UserRole.ADMIN,
      status,
    });

  describe('login (ADMIN-only)', () => {
    it('returns a session with an access token and user profile', async () => {
      const seeded = await seedAdmin();

      const session = await auth.login({ email: 'admin@monorepo.local', password: ADMIN_PASSWORD });
      expect(session.accessToken.split('.')).toHaveLength(3);
      expect(session.user.phone).toBe(seeded.phone);
      expect(session.user.status).toBe('ACTIVE');
      expect(session.user.accountRoles).toEqual([]);
      expect(session.refreshToken).not.toContain(seeded.phone);
      expect(session.refreshExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects wrong passwords', async () => {
      await seedAdmin();
      await expect(
        auth.login({ email: 'admin@monorepo.local', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects phone-OTP users without a stored password hash', async () => {
      fake.seedUser({
        phone: '09123334444',
        email: 'otp@monorepo.local',
        name: 'Otp User',
        passwordHash: null,
      });
      await expect(
        auth.login({ email: 'otp@monorepo.local', password: 'whatever-pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects unknown emails with the same error', async () => {
      await expect(
        auth.login({ email: 'ghost@monorepo.local', password: 'whatever-pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects correct credentials on a non-admin account with 403 (AUTH-003)', async () => {
      fake.seedUser({
        phone: '09123334444',
        email: 'legacy@monorepo.local',
        name: 'Legacy',
        passwordHash: await hash('legacy-pass-123', 4),
        role: UserRole.USER,
      });
      const thrown = await rejected<ForbiddenException>(() =>
        auth.login({ email: 'legacy@monorepo.local', password: 'legacy-pass-123' }),
      );
      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect((thrown.getResponse() as { code: string }).code).toBe(
        AUTH_ERROR_CODES.ADMIN_ONLY_LOGIN,
      );
    });

    it.each([UserStatus.SUSPENDED, UserStatus.BLOCKED, UserStatus.DELETED])(
      'rejects a %s admin with 403 and the mapped code',
      async (status) => {
        await seedAdmin(status);
        const thrown = await rejected<ForbiddenException>(() =>
          auth.login({ email: 'admin@monorepo.local', password: ADMIN_PASSWORD }),
        );
        expect(thrown).toBeInstanceOf(ForbiddenException);
        const expectedCode =
          status === UserStatus.SUSPENDED
            ? AUTH_ERROR_CODES.ACCOUNT_SUSPENDED
            : status === UserStatus.BLOCKED
              ? AUTH_ERROR_CODES.ACCOUNT_BLOCKED
              : AUTH_ERROR_CODES.ACCOUNT_DELETED;
        expect((thrown.getResponse() as { code: string }).code).toBe(expectedCode);
      },
    );
  });

  describe('requestOtp', () => {
    it('delegates to OtpService with the LOGIN purpose and default client type', async () => {
      const result = await auth.requestOtp({ phone: '09121234567' });
      expect(otp.requests).toEqual([{ phone: '09121234567', clientType: SmsClientType.Web }]);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('forwards the client type', async () => {
      await auth.requestOtp({ phone: '09121234567', clientType: SmsClientType.Android });
      expect(otp.requests[0]?.clientType).toBe(SmsClientType.Android);
    });
  });

  describe('verifyOtp (login-or-register)', () => {
    it('creates the user on first login with the OTP defaults', async () => {
      const result = await auth.verifyOtp({ phone: '09123334444', code: '123456' });

      expect(result.accessToken.split('.')).toHaveLength(3);
      expect(result.user.phone).toBe('09123334444');
      expect(result.user.role).toBe(UserRole.USER);
      expect(result.user.status).toBe(UserStatus.ACTIVE);
      expect(result.user.accountRoles).toEqual([]);
      // Placeholder display name, not a schema default.
      expect(result.user.name).toBe('کاربر 0912***444');
      // Placeholder onboarding hint: name set → treated as onboarded (ONB-001 replaces this).
      expect(result.onboardingCompleted).toBe(true);
      expect(result.refreshToken).toEqual(expect.any(String));

      const stored = await fake.user.findUnique({ where: { phone: '09123334444' } });
      expect(stored?.passwordHash).toBeNull();
    });

    it('reuses the existing user and never duplicates rows', async () => {
      fake.seedUser({ phone: '09123334444', name: 'Ali' });

      const result = await auth.verifyOtp({ phone: '09123334444', code: '123456' });
      expect(result.user.name).toBe('Ali');

      const count = await fake.user.count({ where: { phone: '09123334444' } });
      expect(count).toBe(1);
    });

    it('propagates OTP verification failures without creating a user', async () => {
      otp.verifyFailure = new UnauthorizedException('Invalid verification code');
      await expect(auth.verifyOtp({ phone: '09123334444', code: '000000' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(await fake.user.count({ where: { phone: '09123334444' } })).toBe(0);
    });

    it.each([UserStatus.SUSPENDED, UserStatus.BLOCKED, UserStatus.DELETED])(
      'rejects a %s account with 403 and the mapped code',
      async (status) => {
        fake.seedUser({ phone: '09123334444', name: 'Restricted', status });
        const thrown = await rejected<ForbiddenException>(() =>
          auth.verifyOtp({ phone: '09123334444', code: '123456' }),
        );
        expect(thrown).toBeInstanceOf(ForbiddenException);
        const expectedCode =
          status === UserStatus.SUSPENDED
            ? AUTH_ERROR_CODES.ACCOUNT_SUSPENDED
            : status === UserStatus.BLOCKED
              ? AUTH_ERROR_CODES.ACCOUNT_BLOCKED
              : AUTH_ERROR_CODES.ACCOUNT_DELETED;
        expect((thrown.getResponse() as { code: string }).code).toBe(expectedCode);
      },
    );
  });

  describe('refresh', () => {
    it('rotates the refresh token and mints a new access token', async () => {
      const session = await auth.verifyOtp({ phone: '09123334444', code: '123456' });

      const rotated = await auth.refresh(session.refreshToken);
      // Access tokens are deterministic within the same second (same iat), so
      // assert shape + rotation of the refresh token instead of inequality.
      expect(rotated.accessToken.split('.')).toHaveLength(3);
      expect(rotated.refreshToken).not.toBe(session.refreshToken);

      // The old token was consumed by rotation.
      await expect(auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
