import type { ConfigService } from '@nestjs/config';
import configuration, { requireAppConfig } from '../configuration';

/** Env keys the configuration factory may read — snapshotted and restored per test. */
const managedKeys = [
  'OTP_DEV_MODE',
  'OTP_TTL_MS',
  'OTP_MAX_ATTEMPTS',
  'OTP_SEND_HOURLY',
  'OTP_SEND_DAILY',
  'STORAGE_DIR',
  'PUBLIC_MEDIA_BASE_URL',
  'MAX_IMAGE_MB',
  'MAX_VIDEO_MB',
  'MAX_LOT_IMAGES',
  'MAX_LOT_VIDEOS',
  'MAX_VIDEO_SECONDS',
  'WS_ORIGINS',
] as const;

describe('configuration factory (PLAT-003 additions)', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = {};
    for (const key of managedKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of managedKeys) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('exposes documented defaults for the new config groups', () => {
    const { app } = configuration();

    expect(app.otp).toEqual({
      devMode: false,
      ttlMs: 120_000,
      maxAttempts: 5,
      sendHourly: 3,
      sendDaily: 5,
    });
    expect(app.storage).toEqual({
      dir: './storage',
      publicMediaBaseUrl: 'http://localhost:3001/media',
    });
    expect(app.uploads).toEqual({
      maxImageMb: 10,
      maxVideoMb: 50,
      maxLotImages: 15,
      maxLotVideos: 3,
      maxVideoSeconds: 60,
    });
    expect(app.ws).toEqual({ origins: ['http://localhost:3000'] });
  });

  it('maps env overrides into the typed groups', () => {
    process.env.OTP_DEV_MODE = 'true';
    process.env.OTP_TTL_MS = '300000';
    process.env.OTP_MAX_ATTEMPTS = '3';
    process.env.STORAGE_DIR = '/var/lib/rakdsho/media';
    process.env.PUBLIC_MEDIA_BASE_URL = 'https://cdn.example.com/media';
    process.env.MAX_VIDEO_MB = '80';
    process.env.MAX_VIDEO_SECONDS = '30';

    const { app } = configuration();

    expect(app.otp).toMatchObject({ devMode: true, ttlMs: 300_000, maxAttempts: 3 });
    expect(app.storage).toEqual({
      dir: '/var/lib/rakdsho/media',
      publicMediaBaseUrl: 'https://cdn.example.com/media',
    });
    expect(app.uploads).toMatchObject({ maxVideoMb: 80, maxVideoSeconds: 30 });
  });

  it('parses WS_ORIGINS into a trimmed, de-blanked string array', () => {
    process.env.WS_ORIGINS = ' https://app.example.com , https://admin.example.com ,, ';

    const { app } = configuration();

    expect(app.ws.origins).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });

  it('requireAppConfig returns the app namespace and fails loudly when missing', () => {
    const withApp = { get: () => configuration().app } as unknown as ConfigService;
    expect(requireAppConfig(withApp).otp.maxAttempts).toBe(5);

    const withoutApp = { get: () => undefined } as unknown as ConfigService;
    expect(() => requireAppConfig(withoutApp)).toThrow('App config namespace "app" is not loaded');
  });
});
