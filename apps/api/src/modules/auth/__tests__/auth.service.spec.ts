import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { UsersRepository } from '../../users/users.repository';
import { UsersService } from '../../users/users.service';
import { AuthService } from '../auth.service';
import { TokenService } from '../token.service';

const ADMIN_PASSWORD = 'admin-pass-123';

describe('AuthService', () => {
  let auth: AuthService;
  let fake: FakePrisma;

  beforeEach(() => {
    fake = new FakePrisma();
    const repository = new UsersRepository(fake as unknown as PrismaService);
    const users = new UsersService(repository, fake as unknown as PrismaService);
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
    auth = new AuthService(repository, users, tokens);
  });

  describe('login', () => {
    it('returns a session with an access token and user profile', async () => {
      const seeded = fake.seedUser({
        email: 'admin@monorepo.local',
        name: 'Admin',
        passwordHash: await hash(ADMIN_PASSWORD, 4),
        role: UserRole.ADMIN,
      });

      const session = await auth.login({ email: seeded.email, password: ADMIN_PASSWORD });
      expect(session.accessToken.split('.')).toHaveLength(3);
      expect(session.user.email).toBe(seeded.email);
      expect(session.refreshToken).not.toContain(seeded.email);
      expect(session.refreshExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects wrong passwords', async () => {
      fake.seedUser({
        email: 'admin@monorepo.local',
        name: 'Admin',
        passwordHash: await hash(ADMIN_PASSWORD, 4),
      });
      await expect(
        auth.login({ email: 'admin@monorepo.local', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects unknown emails with the same error', async () => {
      await expect(
        auth.login({ email: 'ghost@monorepo.local', password: 'whatever-pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('creates the user and starts a session', async () => {
      const session = await auth.register({
        email: 'new@example.com',
        name: 'New',
        password: 'super-secret-1',
      });
      expect(session.user.email).toBe('new@example.com');
      expect(session.user.role).toBe(UserRole.USER);
    });

    it('propagates duplicate-email conflicts', async () => {
      await auth.register({ email: 'new@example.com', name: 'New', password: 'super-secret-1' });
      await expect(
        auth.register({ email: 'new@example.com', name: 'New', password: 'super-secret-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and mints a new access token', async () => {
      const session = await auth.register({
        email: 'new@example.com',
        name: 'New',
        password: 'super-secret-1',
      });

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
