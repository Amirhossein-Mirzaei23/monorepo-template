import { Environment, validateEnv } from '../env.validation';

/** Minimal env that satisfies the required variables (mirrors src/test/set-env.ts). */
const baseEnv: Record<string, unknown> = {
  NODE_ENV: Environment.Test,
  DATABASE_URL: 'postgresql://template:template@localhost:5432/template',
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret',
};

describe('validateEnv (PLAT-003 additions)', () => {
  describe('defaults', () => {
    it('applies documented defaults when the new variables are absent', () => {
      const validated = validateEnv({ ...baseEnv });

      expect(validated.OTP_DEV_MODE).toBe('false');
      expect(validated.OTP_TTL_MS).toBe(120000);
      expect(validated.OTP_MAX_ATTEMPTS).toBe(5);
      expect(validated.OTP_SEND_HOURLY).toBe(3);
      expect(validated.OTP_SEND_DAILY).toBe(5);
      expect(validated.STORAGE_DIR).toBe('./storage');
      expect(validated.PUBLIC_MEDIA_BASE_URL).toBe('http://localhost:3001/media');
      expect(validated.MAX_IMAGE_MB).toBe(10);
      expect(validated.MAX_VIDEO_MB).toBe(50);
      expect(validated.MAX_LOT_IMAGES).toBe(15);
      expect(validated.MAX_LOT_VIDEOS).toBe(3);
      expect(validated.MAX_VIDEO_SECONDS).toBe(60);
      expect(validated.WS_ORIGINS).toBe('http://localhost:3000');
    });

    it('accepts explicit valid overrides', () => {
      const validated = validateEnv({
        ...baseEnv,
        OTP_DEV_MODE: 'true',
        OTP_TTL_MS: '300000',
        OTP_MAX_ATTEMPTS: '3',
        OTP_SEND_HOURLY: '2',
        OTP_SEND_DAILY: '4',
        STORAGE_DIR: '/var/lib/rakdsho/media',
        PUBLIC_MEDIA_BASE_URL: 'https://cdn.example.com/media',
        MAX_IMAGE_MB: '20',
        MAX_VIDEO_MB: '80',
        MAX_LOT_IMAGES: '10',
        MAX_LOT_VIDEOS: '1',
        MAX_VIDEO_SECONDS: '30',
        WS_ORIGINS: 'https://app.example.com,https://admin.example.com',
      });

      expect(validated.OTP_DEV_MODE).toBe('true');
      expect(validated.OTP_TTL_MS).toBe(300000);
      expect(validated.OTP_MAX_ATTEMPTS).toBe(3);
      expect(validated.OTP_SEND_HOURLY).toBe(2);
      expect(validated.OTP_SEND_DAILY).toBe(4);
      expect(validated.STORAGE_DIR).toBe('/var/lib/rakdsho/media');
      expect(validated.PUBLIC_MEDIA_BASE_URL).toBe('https://cdn.example.com/media');
      expect(validated.MAX_IMAGE_MB).toBe(20);
      expect(validated.MAX_VIDEO_MB).toBe(80);
      expect(validated.MAX_LOT_IMAGES).toBe(10);
      expect(validated.MAX_LOT_VIDEOS).toBe(1);
      expect(validated.MAX_VIDEO_SECONDS).toBe(30);
      expect(validated.WS_ORIGINS).toBe('https://app.example.com,https://admin.example.com');
    });
  });

  describe('invalid values are rejected', () => {
    it.each<[string, Record<string, unknown>]>([
      ['OTP_DEV_MODE is not a strict boolean', { OTP_DEV_MODE: 'yes' }],
      ['OTP_TTL_MS is not an integer', { OTP_TTL_MS: 'two-minutes' }],
      ['OTP_TTL_MS is below the 1s floor', { OTP_TTL_MS: '999' }],
      ['OTP_MAX_ATTEMPTS is zero', { OTP_MAX_ATTEMPTS: '0' }],
      ['OTP_SEND_HOURLY is negative', { OTP_SEND_HOURLY: '-1' }],
      ['OTP_SEND_DAILY is not a number', { OTP_SEND_DAILY: 'unlimited' }],
      ['STORAGE_DIR is empty', { STORAGE_DIR: '' }],
      [
        'PUBLIC_MEDIA_BASE_URL is not http(s)',
        { PUBLIC_MEDIA_BASE_URL: 'ftp://media.example.com' },
      ],
      ['MAX_IMAGE_MB is zero', { MAX_IMAGE_MB: '0' }],
      ['MAX_VIDEO_MB is not an integer', { MAX_VIDEO_MB: '50.5' }],
      ['MAX_LOT_IMAGES is zero', { MAX_LOT_IMAGES: '0' }],
      ['MAX_LOT_VIDEOS is negative', { MAX_LOT_VIDEOS: '-2' }],
      ['MAX_VIDEO_SECONDS is zero', { MAX_VIDEO_SECONDS: '0' }],
    ])('rejects when %s', (_name, overrides) => {
      expect(() => validateEnv({ ...baseEnv, ...overrides })).toThrow(
        'Environment validation failed',
      );
    });
  });

  describe('OTP dev-mode boot refusal', () => {
    it('throws when OTP_DEV_MODE=true and NODE_ENV=production', () => {
      expect(() =>
        validateEnv({ ...baseEnv, NODE_ENV: Environment.Production, OTP_DEV_MODE: 'true' }),
      ).toThrow('OTP_DEV_MODE: must be "false" when NODE_ENV=production');
    });

    it('allows OTP_DEV_MODE=true outside production', () => {
      expect(() =>
        validateEnv({ ...baseEnv, NODE_ENV: Environment.Development, OTP_DEV_MODE: 'true' }),
      ).not.toThrow();
      expect(() =>
        validateEnv({ ...baseEnv, NODE_ENV: Environment.Test, OTP_DEV_MODE: 'true' }),
      ).not.toThrow();
    });

    it('allows OTP_DEV_MODE=false in production', () => {
      expect(() =>
        validateEnv({ ...baseEnv, NODE_ENV: Environment.Production, OTP_DEV_MODE: 'false' }),
      ).not.toThrow();
    });
  });
});
