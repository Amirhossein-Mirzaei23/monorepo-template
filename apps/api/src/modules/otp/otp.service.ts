import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import { requireAppConfig, type OtpConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsClientType } from '../sms/sms.constants';
import { SmsService } from '../sms/sms.service';
import { OTP_ERROR_CODES } from './otp.constants';
import { OtpRepository } from './otp.repository';

/** Rolling per-phone send-cap windows (plan §R10: 3/hour, 5/day). */
const SEND_WINDOW_HOURLY_MS = 60 * 60 * 1000;
const SEND_WINDOW_DAILY_MS = 24 * 60 * 60 * 1000;

/** Result of issuing a code. */
export interface OtpRequestResult {
  /** Row expiry — enough for AUTH-003 to drive the client resend countdown. */
  expiresAt: Date;
  /**
   * Present only when dev mode is enabled (`OTP_DEV_MODE`, refused in
   * production by env validation). The sanctioned channel for exposing the
   * code — AUTH-003 may echo it in the response body; it is never logged.
   */
  devCode?: string;
}

export interface OtpVerifyResult {
  ok: true;
}

/**
 * OTP issue/verify domain service (AUTH-002). Codes are 6-digit crypto-random
 * values stored as sha256 hashes only, single-use (consume-once), throttled
 * per phone (rolling 3/hour and 5/day send caps) and locked after
 * `maxAttempts` wrong submissions until the row expires. This layer owns
 * transaction boundaries; data access lives in OtpRepository. The HTTP surface
 * arrives with AUTH-003.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly otpConfig: OtpConfig;

  constructor(
    configService: ConfigService,
    private readonly repository: OtpRepository,
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {
    this.otpConfig = requireAppConfig(configService).otp;
  }

  /**
   * Issue (and deliver) a new code for phone+purpose, invalidating any prior
   * active code. Throws 429 `TOO_MANY_REQUESTS` (with a retry-after hint) when
   * the per-phone send caps are exhausted, and propagates the SmsService 503
   * when delivery fails (the undelivered row is invalidated first).
   */
  async request(
    phone: string,
    purpose: OtpPurpose = OtpPurpose.LOGIN,
    clientType: SmsClientType = SmsClientType.Web,
  ): Promise<OtpRequestResult> {
    const now = new Date();
    await this.assertWithinSendCaps(phone, now);

    const code = generateCode();
    const row = await this.prisma.$transaction(async (tx) => {
      // One active code per phone+purpose (AUTH-001 partial unique index):
      // invalidating previous codes and creating the new one must be atomic.
      await this.repository.invalidateActiveCodes(phone, purpose, now, tx);
      return this.repository.create(
        {
          phone,
          codeHash: sha256(code),
          purpose,
          lastSentAt: now,
          expiresAt: new Date(now.getTime() + this.otpConfig.ttlMs),
        },
        tx,
      );
    });

    if (this.otpConfig.devMode) {
      this.logger.log(`OTP issued for ${maskPhone(phone)} (${purpose}) — dev mode, SMS skipped`);
      return { expiresAt: row.expiresAt, devCode: code };
    }

    try {
      await this.sms.sendOtp(phone, code, clientType);
    } catch (error) {
      // The code was never delivered: keep the row for audit but consume it so
      // it can never verify, then surface the provider failure as-is.
      await this.repository.consume(row.id, new Date());
      this.logger.error(`OTP delivery to ${maskPhone(phone)} failed — issued code invalidated`);
      throw error;
    }

    this.logger.log(`OTP issued for ${maskPhone(phone)} (${purpose})`);
    return { expiresAt: row.expiresAt };
  }

  /**
   * Verify a submitted code. Generic 401 for a wrong code, no active code or
   * an already-consumed one (no state leakage); 401 `LOCKED` once
   * `maxAttempts` wrong submissions were counted (until the row expires);
   * `{ ok: true }` on success — the row is consumed atomically, so the same
   * code can never verify twice.
   */
  async verify(
    phone: string,
    code: string,
    purpose: OtpPurpose = OtpPurpose.LOGIN,
  ): Promise<OtpVerifyResult> {
    const now = new Date();
    const row = await this.repository.findActive(phone, purpose, now);
    if (!row) {
      throw unauthorized();
    }
    if (row.attempts >= this.otpConfig.maxAttempts) {
      throw locked();
    }
    if (!constantTimeEquals(sha256(code), row.codeHash)) {
      await this.repository.incrementAttempts(row.id);
      throw unauthorized();
    }
    const consumed = await this.repository.consume(row.id, now);
    if (!consumed) {
      // A concurrent verify won the consume-once race — treat as a failure.
      throw unauthorized();
    }
    return { ok: true };
  }

  /** Rolling-window send caps per phone (across purposes): 3/hour, 5/day by config. */
  private async assertWithinSendCaps(phone: string, now: Date): Promise<void> {
    const { sendHourly, sendDaily } = this.otpConfig;

    const hourAgo = new Date(now.getTime() - SEND_WINDOW_HOURLY_MS);
    const hourlyCount = await this.repository.countSentSince(phone, hourAgo);
    if (hourlyCount >= sendHourly) {
      const earliest = await this.repository.findEarliestSentSince(phone, hourAgo);
      throw sendCap(retryAfterSeconds(earliest?.lastSentAt, SEND_WINDOW_HOURLY_MS, now));
    }

    const dayAgo = new Date(now.getTime() - SEND_WINDOW_DAILY_MS);
    const dailyCount = await this.repository.countSentSince(phone, dayAgo);
    if (dailyCount >= sendDaily) {
      const earliest = await this.repository.findEarliestSentSince(phone, dayAgo);
      throw sendCap(retryAfterSeconds(earliest?.lastSentAt, SEND_WINDOW_DAILY_MS, now));
    }
  }
}

/** Uniform 6-digit code: `randomInt` has no modulo bias; padding keeps leading zeros. */
function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Constant-time equality of two sha256 hex digests (both 32-byte buffers). */
function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  // timingSafeEqual throws on length mismatch; digest length is not a secret.
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

/** Same masking policy as SmsService — full phone numbers never reach the logs. */
function maskPhone(phone: string): string {
  return phone.length <= 7 ? '***' : `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

/** Seconds until the oldest counted send leaves the window (whole window as fallback). */
function retryAfterSeconds(oldestSentAt: Date | undefined, windowMs: number, now: Date): number {
  if (!oldestSentAt) {
    return Math.ceil(windowMs / 1000);
  }
  const remainingMs = oldestSentAt.getTime() + windowMs - now.getTime();
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

function sendCap(retryAfterSeconds: number): HttpException {
  return new HttpException(
    {
      code: OTP_ERROR_CODES.TOO_MANY_REQUESTS,
      message: 'Too many OTP requests for this phone number — try again later',
      retryAfterSeconds,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

function unauthorized(): HttpException {
  return new UnauthorizedException({
    code: OTP_ERROR_CODES.UNAUTHORIZED,
    message: 'Invalid verification code',
  });
}

function locked(): HttpException {
  return new UnauthorizedException({
    code: OTP_ERROR_CODES.LOCKED,
    message: 'Too many incorrect attempts — request a new code',
  });
}
