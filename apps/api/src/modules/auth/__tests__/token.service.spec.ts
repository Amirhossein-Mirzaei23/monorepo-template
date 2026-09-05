import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { TokenService } from '../token.service';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('TokenService', () => {
  let tokens: TokenService;
  let fake: FakePrisma;
  let jwtService: JwtService;

  beforeEach(() => {
    fake = new FakePrisma();
    jwtService = new JwtService({});
    const config = new ConfigService({
      app: {
        jwt: {
          accessSecret: 'unit-test-access-secret',
          refreshSecret: 'unit-test-refresh-secret',
          accessTtl: '15m',
          refreshTtl: '30d',
        },
      },
    });
    tokens = new TokenService(jwtService, config, fake as unknown as PrismaService);
  });

  describe('access tokens', () => {
    it('signs and verifies a round trip with the phone-based payload', async () => {
      const token = await tokens.issueAccessToken({
        id: 'user-1',
        phone: '09120000000',
        role: 'USER',
        status: 'ACTIVE',
      });
      const payload = await tokens.verifyAccessToken(token);
      expect(payload.sub).toBe('user-1');
      expect(payload.phone).toBe('09120000000');
      expect(payload.role).toBe('USER');
      expect(payload.status).toBe('ACTIVE');
      // email is no longer part of the access-token payload (AUTH-001).
      expect(payload).not.toHaveProperty('email');
    });

    it('rejects tampered tokens', async () => {
      await expect(tokens.verifyAccessToken('not-a-jwt')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('refresh rotation', () => {
    it('stores only a hash of the refresh token', async () => {
      const { token } = await tokens.issueRefreshToken('user-1');
      const stored = await fake.refreshToken.findUnique({
        where: { tokenHash: sha256(token) },
      });
      expect(stored).not.toBeNull();
      expect(stored?.tokenHash).not.toBe(token);
    });

    it('rotates: each token works exactly once, in order', async () => {
      const first = await tokens.issueRefreshToken('user-1');
      const second = await tokens.rotateRefreshToken(first.token);
      expect(second.token).not.toBe(first.token);

      const third = await tokens.rotateRefreshToken(second.token);
      expect(third.userId).toBe('user-1');

      // Replaying the original now triggers reuse detection and kills the family.
      await expect(tokens.rotateRefreshToken(first.token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(tokens.rotateRefreshToken(third.token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('reuse of a rotated token revokes the whole family', async () => {
      const first = await tokens.issueRefreshToken('user-1');
      const second = await tokens.rotateRefreshToken(first.token);

      // Replaying `first` is treated as theft → everything for user-1 dies.
      await expect(tokens.rotateRefreshToken(first.token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(tokens.rotateRefreshToken(second.token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects expired tokens', async () => {
      const raw = 'expired-token-value';
      await fake.refreshToken.create({
        data: { tokenHash: sha256(raw), userId: 'user-1', expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(tokens.rotateRefreshToken(raw)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('logout revokes the presented token', async () => {
      const { token } = await tokens.issueRefreshToken('user-1');
      await tokens.revokeRefreshToken(token);
      await expect(tokens.rotateRefreshToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
