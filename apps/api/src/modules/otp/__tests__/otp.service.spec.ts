import { type HttpException, ServiceUnavailableException, type Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { OtpConfig } from '../../../config/configuration';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { SmsClientType } from '../../sms/sms.constants';
import type { SmsService } from '../../sms/sms.service';
import { OTP_ERROR_CODES } from '../otp.constants';
import { OtpRepository } from '../otp.repository';
import { OtpService } from '../otp.service';

const PHONE = '09121234567';
const MINUTE_MS = 60 * 1000;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const minutesAgo = (minutes: number): Date => new Date(Date.now() - minutes * MINUTE_MS);

interface SendOtpCall {
  phone: string;
  code: string;
  clientType: SmsClientType;
}

/** SmsService stand-in: records calls, can be told to fail. */
class FakeSmsService {
  readonly calls: SendOtpCall[] = [];
  failure: Error | null = null;

  async sendOtp(
    phone: string,
    code: string,
    clientType: SmsClientType = SmsClientType.Web,
  ): Promise<void> {
    this.calls.push({ phone, code, clientType });
    if (this.failure) {
      throw this.failure;
    }
  }
}

function makeService(otpOverrides: Partial<OtpConfig> = {}): {
  service: OtpService;
  fake: FakePrisma;
  sms: FakeSmsService;
} {
  const fake = new FakePrisma();
  const sms = new FakeSmsService();
  const otp: OtpConfig = {
    devMode: false,
    ttlMs: 120_000,
    maxAttempts: 5,
    sendHourly: 3,
    sendDaily: 5,
    ...otpOverrides,
  };
  const configService = { get: () => ({ otp }) } as unknown as ConfigService;
  const service = new OtpService(
    configService,
    new OtpRepository(fake as unknown as PrismaService),
    fake as unknown as PrismaService,
    sms as unknown as SmsService,
  );
  return { service, fake, sms };
}

/** Runs fn, fails the test unless it rejects, and returns the thrown HttpException. */
async function expectHttpError(fn: () => Promise<unknown>): Promise<HttpException> {
  try {
    await fn();
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('expected fn to reject');
}

function responseBody(error: HttpException): Record<string, unknown> {
  const body = error.getResponse();
  return typeof body === 'string' ? { message: body } : (body as Record<string, unknown>);
}

/** A six-digit code guaranteed different from the issued one. */
function wrongCodeFor(issued: string): string {
  return issued === '000000' ? '000001' : '000000';
}

describe('OtpService', () => {
  describe('request', () => {
    it('stores only the sha256 hash with fresh policy fields', async () => {
      const { service, fake, sms } = makeService();

      await service.request(PHONE);

      expect(sms.calls).toHaveLength(1);
      const sent = sms.calls[0]!;
      expect(sent.phone).toBe(PHONE);
      expect(sent.clientType).toBe(SmsClientType.Web);
      expect(sent.code).toMatch(/^\d{6}$/);

      const row = await fake.otpCode.findFirst({ where: { phone: PHONE } });
      expect(row).not.toBeNull();
      expect(row?.codeHash).toBe(sha256(sent.code));
      expect(row?.codeHash).not.toBe(sent.code);
      expect(row?.purpose).toBe(OtpPurpose.LOGIN);
      expect(row?.attempts).toBe(0);
      expect(row?.consumedAt).toBeNull();
      expect(row?.lastSentAt.getTime()).toBeGreaterThan(Date.now() - 10_000);
      // TTL from config: 2 minutes from now (allowing a little test slack).
      expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
      expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 125_000);
    });

    it('forwards the client type to the SMS pattern selection', async () => {
      const { service, sms } = makeService();

      await service.request(PHONE, OtpPurpose.LOGIN, SmsClientType.Android);

      expect(sms.calls[0]?.clientType).toBe(SmsClientType.Android);
    });

    it('invalidates the previous active code for the same phone+purpose', async () => {
      const { service, fake } = makeService({ devMode: true });

      await service.request(PHONE);
      const second = await service.request(PHONE);

      const total = await fake.otpCode.count({ where: { phone: PHONE } });
      const active = await fake.otpCode.count({
        where: { phone: PHONE, purpose: OtpPurpose.LOGIN, consumedAt: null },
      });
      expect(total).toBe(2);
      expect(active).toBe(1);

      const activeRow = await fake.otpCode.findFirst({
        where: { phone: PHONE, consumedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(activeRow?.codeHash).toBe(sha256(second.devCode!));
    });

    it('counts sends across purposes toward the per-phone caps', async () => {
      const { service, fake } = makeService();
      fake.seedOtpCode({ phone: PHONE, purpose: OtpPurpose.LOGIN, lastSentAt: minutesAgo(5) });
      fake.seedOtpCode({
        phone: PHONE,
        purpose: OtpPurpose.PHONE_CHANGE,
        lastSentAt: minutesAgo(6),
      });
      fake.seedOtpCode({ phone: PHONE, purpose: OtpPurpose.LOGIN, lastSentAt: minutesAgo(7) });

      const error = await expectHttpError(() => service.request(PHONE, OtpPurpose.PHONE_CHANGE));

      expect(error.getStatus()).toBe(429);
      expect(responseBody(error)['code']).toBe(OTP_ERROR_CODES.TOO_MANY_REQUESTS);
      expect(await fake.otpCode.count({ where: { phone: PHONE } })).toBe(3);
    });

    it('throws 429 with a retry-after hint when the hourly cap is hit', async () => {
      const { service, fake, sms } = makeService();
      for (const minutes of [30, 20, 10]) {
        fake.seedOtpCode({ phone: PHONE, lastSentAt: minutesAgo(minutes) });
      }

      const error = await expectHttpError(() => service.request(PHONE));

      expect(error.getStatus()).toBe(429);
      const body = responseBody(error);
      expect(body['code']).toBe(OTP_ERROR_CODES.TOO_MANY_REQUESTS);
      // Oldest counted send is 30 min ago: retry after ~30 more minutes.
      expect(body['retryAfterSeconds']).toBeGreaterThanOrEqual(1790);
      expect(body['retryAfterSeconds']).toBeLessThanOrEqual(1800);
      expect(sms.calls).toHaveLength(0);
      expect(await fake.otpCode.count({ where: { phone: PHONE } })).toBe(3);
    });

    it('stops counting sends once the hourly window has passed', async () => {
      const { service, fake, sms } = makeService();
      for (const minutes of [130, 125, 120]) {
        fake.seedOtpCode({ phone: PHONE, lastSentAt: minutesAgo(minutes) });
      }

      await service.request(PHONE);

      expect(sms.calls).toHaveLength(1);
      expect(await fake.otpCode.count({ where: { phone: PHONE } })).toBe(4);
    });

    it('enforces the daily cap independently of the hourly cap', async () => {
      const { service, fake } = makeService();
      // Five sends within 24h, none within the last hour.
      for (const minutes of [360, 300, 240, 180, 120]) {
        fake.seedOtpCode({ phone: PHONE, lastSentAt: minutesAgo(minutes) });
      }

      const error = await expectHttpError(() => service.request(PHONE));

      expect(error.getStatus()).toBe(429);
      const body = responseBody(error);
      expect(body['code']).toBe(OTP_ERROR_CODES.TOO_MANY_REQUESTS);
      // Oldest counted send is 6h ago: retry after ~18 more hours.
      expect(body['retryAfterSeconds']).toBeGreaterThanOrEqual(18 * 3600 - 10);
      expect(body['retryAfterSeconds']).toBeLessThanOrEqual(18 * 3600);
      expect(await fake.otpCode.count({ where: { phone: PHONE } })).toBe(5);
    });

    it('allows requests again once the daily window has passed', async () => {
      const { service, fake, sms } = makeService();
      for (const minutes of [1500, 1450, 1440]) {
        fake.seedOtpCode({ phone: PHONE, lastSentAt: minutesAgo(minutes) });
      }

      await service.request(PHONE);

      expect(sms.calls).toHaveLength(1);
    });

    it('propagates the SMS failure and invalidates the undelivered code', async () => {
      const { service, fake, sms } = makeService();
      sms.failure = new ServiceUnavailableException('SMS delivery failed');

      const error = await expectHttpError(() => service.request(PHONE));

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.message).toBe('SMS delivery failed');
      // The row stays for audit but is consumed — an undelivered code can never verify.
      expect(await fake.otpCode.count({ where: { phone: PHONE } })).toBe(1);
      expect(await fake.otpCode.count({ where: { phone: PHONE, consumedAt: null } })).toBe(0);
      const verifyError = await expectHttpError(() => service.verify(PHONE, '123456'));
      expect(verifyError.getStatus()).toBe(401);
    });
  });

  describe('dev mode', () => {
    it('skips SMS and returns the generated code through the result', async () => {
      const { service, sms } = makeService({ devMode: true });

      const result = await service.request(PHONE);

      expect(result.devCode).toMatch(/^\d{6}$/);
      expect(sms.calls).toHaveLength(0);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      await expect(service.verify(PHONE, result.devCode!)).resolves.toEqual({ ok: true });
    });

    it('logs the masked phone and never the code value (dev mode)', async () => {
      const { service } = makeService({ devMode: true });
      const logger = (service as unknown as { logger: Logger }).logger;
      const logSpy = jest.spyOn(logger, 'log');

      const result = await service.request(PHONE);

      const logged = logSpy.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(logged).toContain('0912***567');
      expect(logged).not.toContain(PHONE);
      expect(logged).not.toContain(result.devCode!);
    });

    it('logs the masked phone and never the delivered code (production mode)', async () => {
      const { service, sms } = makeService();
      const logger = (service as unknown as { logger: Logger }).logger;
      const logSpy = jest.spyOn(logger, 'log');

      await service.request(PHONE);

      const logged = logSpy.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(logged).toContain('0912***567');
      expect(logged).not.toContain(PHONE);
      expect(logged).not.toContain(sms.calls[0]!.code);
    });
  });

  describe('verify', () => {
    it('consumes the code once — a second verify with the same code fails', async () => {
      const { service, fake } = makeService({ devMode: true });
      const { devCode } = await service.request(PHONE);

      await expect(service.verify(PHONE, devCode!)).resolves.toEqual({ ok: true });

      const row = await fake.otpCode.findFirst({ where: { phone: PHONE } });
      expect(row?.consumedAt).not.toBeNull();

      const error = await expectHttpError(() => service.verify(PHONE, devCode!));
      expect(error.getStatus()).toBe(401);
      expect(responseBody(error)['code']).toBe(OTP_ERROR_CODES.UNAUTHORIZED);
    });

    it('rejects a wrong code generically and counts the attempt', async () => {
      const { service, fake } = makeService({ devMode: true });
      const { devCode } = await service.request(PHONE);

      const error = await expectHttpError(() => service.verify(PHONE, wrongCodeFor(devCode!)));

      expect(error.getStatus()).toBe(401);
      expect(responseBody(error)['code']).toBe(OTP_ERROR_CODES.UNAUTHORIZED);
      const row = await fake.otpCode.findFirst({ where: { phone: PHONE } });
      expect(row?.attempts).toBe(1);
      expect(row?.consumedAt).toBeNull();
    });

    it('gives the identical generic error for unknown phone and expired codes', async () => {
      const { service, fake } = makeService({ devMode: true });
      const { devCode } = await service.request(PHONE);

      const wrong = await expectHttpError(() => service.verify(PHONE, wrongCodeFor(devCode!)));
      const unknownPhone = await expectHttpError(() => service.verify('09129999999', '123456'));
      fake.seedOtpCode({
        phone: '09128888888',
        codeHash: sha256('123456'),
        expiresAt: minutesAgo(1),
      });
      const expired = await expectHttpError(() => service.verify('09128888888', '123456'));

      expect(responseBody(unknownPhone)).toEqual(responseBody(wrong));
      expect(responseBody(expired)).toEqual(responseBody(wrong));
      expect(unknownPhone.getStatus()).toBe(401);
    });

    it('locks after five wrong attempts and rejects the correct code while unexpired', async () => {
      const { service, fake } = makeService({ devMode: true });
      const { devCode } = await service.request(PHONE);
      const wrong = wrongCodeFor(devCode!);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const error = await expectHttpError(() => service.verify(PHONE, wrong));
        expect(error.getStatus()).toBe(401);
        expect(responseBody(error)['code']).toBe(OTP_ERROR_CODES.UNAUTHORIZED);
      }
      expect(await fake.otpCode.findFirst({ where: { phone: PHONE } })).toMatchObject({
        attempts: 5,
      });

      // The correct code arrives too late: locked until the row expires.
      const locked = await expectHttpError(() => service.verify(PHONE, devCode!));
      expect(locked.getStatus()).toBe(401);
      expect(responseBody(locked)['code']).toBe(OTP_ERROR_CODES.LOCKED);

      const row = await fake.otpCode.findFirst({ where: { phone: PHONE } });
      expect(row?.consumedAt).toBeNull();
    });

    it('ends the lock when the row expires — expired locked rows fall back to the generic error', async () => {
      const { service, fake } = makeService();
      fake.seedOtpCode({
        phone: PHONE,
        codeHash: sha256('654321'),
        attempts: 5,
        expiresAt: minutesAgo(1),
      });

      const error = await expectHttpError(() => service.verify(PHONE, '654321'));

      expect(error.getStatus()).toBe(401);
      expect(responseBody(error)['code']).toBe(OTP_ERROR_CODES.UNAUTHORIZED);
    });

    it('scopes verification by purpose — PHONE_CHANGE codes never satisfy LOGIN', async () => {
      const { service } = makeService({ devMode: true });
      const { devCode } = await service.request(PHONE, OtpPurpose.PHONE_CHANGE);

      const error = await expectHttpError(() => service.verify(PHONE, devCode!));

      expect(error.getStatus()).toBe(401);
      await expect(service.verify(PHONE, devCode!, OtpPurpose.PHONE_CHANGE)).resolves.toEqual({
        ok: true,
      });
    });
  });
});
