import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SmsConfig } from '../../../config/configuration';
import { SmsClientType } from '../sms.constants';
import { SmsService } from '../sms.service';

function makeService(overrides: Partial<SmsConfig> = {}): SmsService {
  const sms: SmsConfig = {
    apiKey: 'test-api-key',
    patternUrl: 'https://sms.example.test/ws/v1/sms/pattern',
    lineNumber: '3000505',
    webPatternCode: 'web-pattern-code',
    androidPatternCode: 'android-pattern-code',
    ...overrides,
  };
  const configService = { get: () => ({ sms }) } as unknown as ConfigService;
  return new SmsService(configService);
}

function okResponse(): Response {
  return { ok: true, status: 200, text: async () => '' } as unknown as Response;
}

describe('SmsService', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  describe('sendOtp', () => {
    it('posts the web pattern payload by default', async () => {
      const service = makeService();

      await service.sendOtp('+989121234567', '123456');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://sms.example.test/ws/v1/sms/pattern');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Api-Key']).toBe('test-api-key');
      expect(JSON.parse(String(init.body))).toEqual({
        code: 'web-pattern-code',
        attributes: { code: '123456', otp: '123456' },
        recipient: '+989121234567',
        line_number: '3000505',
        number_format: 'english',
      });
    });

    it('uses the android pattern with code-only attributes', async () => {
      const service = makeService();

      await service.sendOtp('+989121234567', '123456', SmsClientType.Android);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        code: 'android-pattern-code',
        attributes: { code: '123456' },
        recipient: '+989121234567',
        line_number: '3000505',
        number_format: 'english',
      });
    });

    it('refuses to send when SMS env vars are not configured', async () => {
      const service = makeService({ apiKey: undefined, webPatternCode: undefined });

      await expect(service.sendOtp('+989121234567', '123456')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('wraps provider failures as 503 without leaking provider details', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '{"message":"invalid api key"}',
      } as unknown as Response);
      const service = makeService();

      await expect(service.sendOtp('+989121234567', '123456')).rejects.toThrow(
        new ServiceUnavailableException('SMS delivery failed'),
      );
    });
  });
});
