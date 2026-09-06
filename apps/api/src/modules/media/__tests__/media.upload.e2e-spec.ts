import type { INestApplication } from '@nestjs/common';
import { MediaType } from '@prisma/client';
import sharp from 'sharp';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { FakePrisma } from '../../../test/fakes/fake-prisma';
import { createTestApp } from '../../../test/utils/create-test-app';

/**
 * Quota override — MUST run before the app boots (the config factory reads env
 * at module init). 3/day makes the 429 path reachable without 200 uploads;
 * jest isolates each spec file in its own process, so this never affects the
 * other suites.
 */
process.env.MAX_IMAGE_UPLOADS_PER_DAY = '3';

/**
 * POST /media e2e (MEDIA-002) — the real app (JWT guard, throttler, multipart
 * interceptor, global filter) against FakePrisma and a real local-disk driver
 * over a temp STORAGE_DIR (MEDIA-001 pattern, overridden via env BEFORE boot).
 * Covers: anonymous 401, happy path (3 URLs stream 200 with correct
 * content-types via the PUBLIC route), forged extension 415 (magic vs declared
 * mime), non-allowlisted declared mime 415, oversize 413 (multer layer),
 * daily quota 429 (config-driven, overridden to 3 above), missing file 400.
 */
describe('POST /media (e2e, MEDIA-002)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  let storageRoot: string;

  /** Hands out unique client IPs so per-IP @Throttle buckets stay isolated per test. */
  let ipCounter = 0;
  const nextIp = (): string => `10.5.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  /** Fresh phone per login: the OTP send cap (3/hour/phone) must never trip. */
  let phoneCounter = 0;
  const nextPhone = (): string => `0951${String(++phoneCounter).padStart(7, '0')}`;

  /** Registers-or-logs-in by phone OTP (dev mode echoes the code) → bearer token. */
  async function login(phone: string): Promise<string> {
    const otp = await request(app.getHttpServer())
      .post('/auth/otp/request')
      .set('X-Forwarded-For', nextIp())
      .send({ phone })
      .expect(200);
    const response = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone, code: otp.body.devCode })
      .expect(200);
    return response.body.accessToken as string;
  }

  /** 600×400 real PNG generated in-process — no binary fixtures committed. */
  const png600x400 = sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 30, g: 144, b: 255 } },
  })
    .png()
    .toBuffer();

  const upload = (
    token: string,
    buffer: Buffer,
    options: { filename?: string; mimetype?: string } = {},
  ) =>
    request(app.getHttpServer())
      .post('/media')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp())
      .attach('file', buffer, {
        filename: options.filename ?? 'photo.png',
        // The DECLARED multipart content-type the server must verify.
        contentType: options.mimetype ?? 'image/png',
      });

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'media-upload-e2e-'));
    process.env.STORAGE_DIR = storageRoot;
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
  });

  afterAll(async () => {
    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.STORAGE_DIR;
    delete process.env.MAX_IMAGE_UPLOADS_PER_DAY;
  });

  it('401 for anonymous callers', async () => {
    await request(app.getHttpServer())
      .post('/media')
      .set('X-Forwarded-For', nextIp())
      .attach('file', await png600x400, { filename: 'photo.png', contentType: 'image/png' })
      .expect(401);
  });

  it('stores an image: 3 absolute URLs that stream with the right content-types (public route)', async () => {
    const token = await login(nextPhone());
    const response = await upload(token, await png600x400).expect(201);

    // Response contract: {id, urls:{original, cover, thumb}, width, height}.
    expect(typeof response.body.id).toBe('string');
    expect(response.body.width).toBe(600);
    expect(response.body.height).toBe(400);
    const urls = response.body.urls;
    expect(urls.original).toMatch(/^http:\/\/localhost:3001\/media\/\d{4}\/\d{2}\/[a-z0-9]+\.png$/);
    expect(urls.cover).toMatch(/^http:\/\/localhost:3001\/media\/\d{4}\/\d{2}\/[a-z0-9]+c\.webp$/);
    expect(urls.thumb).toMatch(/^http:\/\/localhost:3001\/media\/\d{4}\/\d{2}\/[a-z0-9]+t\.webp$/);

    // One MediaAsset row: original key + thumb key, IMAGE, source mime + size.
    const row = await prisma.mediaAsset.findUnique({ where: { id: response.body.id } });
    expect(row).toMatchObject({
      type: MediaType.IMAGE,
      storageKey: urls.original.slice('http://localhost:3001/media/'.length),
      thumbKey: urls.thumb.slice('http://localhost:3001/media/'.length),
      mime: 'image/png',
      width: 600,
      height: 400,
    });

    // All three URLs stream 200 from the PUBLIC route with the right types.
    const original = await request(app.getHttpServer())
      .get(new URL(urls.original).pathname)
      .set('X-Forwarded-For', nextIp())
      .expect(200);
    expect(original.headers['content-type']).toBe('image/png');
    expect(original.headers['cache-control']).toContain('immutable');

    for (const [url, expectedWidth, expectedHeight] of [
      [urls.cover, 600, 400], // source ≤ 1200w → never upscaled
      [urls.thumb, 480, 320], // 400 × 480/600 — aspect preserved
    ] as const) {
      const variant = await request(app.getHttpServer())
        .get(new URL(url).pathname)
        .set('X-Forwarded-For', nextIp())
        .expect(200);
      expect(variant.headers['content-type']).toBe('image/webp');
      // WebP container magic: RIFF....WEBP
      expect(variant.body.toString('latin1', 0, 4)).toBe('RIFF');
      expect(variant.body.toString('latin1', 8, 12)).toBe('WEBP');
      const meta = await sharp(variant.body).metadata();
      expect(meta.width).toBe(expectedWidth);
      expect(meta.height).toBe(expectedHeight);
    }
  });

  it('415 MEDIA_TYPE_MISMATCH for a forged extension: JPEG bytes named .png declared image/png', async () => {
    const token = await login(nextPhone());
    const jpeg = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 250, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    const response = await upload(token, jpeg, {
      filename: 'forged.png',
      mimetype: 'image/png',
    }).expect(415);
    expect(response.body.code).toBe('MEDIA_TYPE_MISMATCH');
  });

  it('415 UNSUPPORTED_MEDIA_TYPE for a declared mime outside the allowlist', async () => {
    const token = await login(nextPhone());
    const response = await upload(token, await png600x400, {
      filename: 'image.bmp',
      mimetype: 'image/bmp',
    }).expect(415);
    expect(response.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('413 when the multipart body exceeds the image size limit (multer layer)', async () => {
    const token = await login(nextPhone());
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 7);
    const response = await upload(token, oversized, {
      filename: 'huge.png',
      mimetype: 'image/png',
    }).expect(413);
    expect(response.body.statusCode).toBe(413);
  }, 30_000);

  it('429 QUOTA_EXCEEDED after the per-user daily cap; other users unaffected', async () => {
    const quotaToken = await login(nextPhone());
    // Cap is 3/day (env override above) — three uploads succeed, the 4th 429s.
    for (let i = 0; i < 3; i++) {
      await upload(quotaToken, await png600x400, { filename: `q${i}.png` }).expect(201);
    }
    const response = await upload(quotaToken, await png600x400, { filename: 'q4.png' }).expect(429);
    expect(response.body.code).toBe('QUOTA_EXCEEDED');

    // Quota is per owner — another user still uploads.
    const otherToken = await login(nextPhone());
    await upload(otherToken, await png600x400).expect(201);
  });

  it('400 when the multipart request carries no file field', async () => {
    const token = await login(nextPhone());
    const response = await request(app.getHttpServer())
      .post('/media')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp())
      .expect(400);
    expect(response.body.message).toContain('file');
  });
});
