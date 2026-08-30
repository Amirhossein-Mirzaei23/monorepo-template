import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { requireAppConfig } from '../../config/configuration';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Parses TTL strings like `15m`, `30d`, `12h` into milliseconds. */
export function parseDuration(ttl: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(ttl.trim());
  if (!match) {
    throw new Error(`Invalid duration: ${ttl}`);
  }
  const amount = Number(match[1]);
  const unitMs: Record<'s' | 'm' | 'h' | 'd', number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * unitMs[match[2] as 's' | 'm' | 'h' | 'd'];
}

export interface RefreshTokenPair {
  token: string;
  expiresAt: Date;
  userId: string;
}

/**
 * Token issuance and rotation.
 * - Access tokens: short-lived JWTs (minutes), returned in the response body.
 * - Refresh tokens: opaque 384-bit random strings; only their sha256 hash is
 *   stored. Rotation on every exchange; reuse of a rotated token revokes the
 *   whole family (breach detection).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issueAccessToken(user: {
    id: string;
    email: string;
    role: AuthUser['role'];
  }): Promise<string> {
    const { jwt } = requireAppConfig(this.config);
    // expiresIn as seconds (number): the jwt typings no longer accept raw strings.
    return this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { secret: jwt.accessSecret, expiresIn: parseDuration(jwt.accessTtl) / 1000 },
    );
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    const { jwt } = requireAppConfig(this.config);
    try {
      return await this.jwt.verifyAsync<AuthUser>(token, { secret: jwt.accessSecret });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  async issueRefreshToken(userId: string): Promise<RefreshTokenPair> {
    const { jwt } = requireAppConfig(this.config);
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + parseDuration(jwt.refreshTtl));

    await this.prisma.refreshToken.create({
      data: { tokenHash: sha256(token), userId, expiresAt },
    });
    return { token, expiresAt, userId };
  }

  /** Exchanges a valid refresh token for a new one, revoking the presented one. */
  async rotateRefreshToken(presented: string): Promise<RefreshTokenPair> {
    const tokenHash = sha256(presented);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt.getTime() <= Date.now()) {
      // Unknown token, or reuse of an already-rotated/revoked token:
      // assume compromise and revoke every session for the user.
      if (stored) {
        await this.revokeAllForUser(stored.userId);
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    const next = await this.issueRefreshToken(stored.userId);
    await this.prisma.refreshToken.updateMany({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return next;
  }

  async revokeRefreshToken(presented: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
