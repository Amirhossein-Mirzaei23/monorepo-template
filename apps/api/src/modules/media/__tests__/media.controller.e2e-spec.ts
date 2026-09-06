import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaType } from '@prisma/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { AppConfig } from '../../../config/configuration';
import type { FakePrisma } from '../../../test/fakes/fake-prisma';
import { createTestApp } from '../../../test/utils/create-test-app';
import { StorageService } from '../storage/storage.service';

/**
 * Media controller e2e (MEDIA-001) — the real app (guards, filters, global
 * pipe) against FakePrisma and a real local-disk driver over a temp
 * STORAGE_DIR (overridden via env BEFORE the app boots; configuration reads
 * it at init). Covers: public streaming with immutable cache headers +
 * content-type from the STORED row, 404 unknown key, 400 traversal/pattern
 * violations, secure route 401 anonymous / 200 with token + private
 * no-store, and the public surface excluding secure keys.
 */
describe('MediaController (e2e)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  let storage: StorageService;
  let storageRoot: string;
  let ownerId: string;
  let token: string;

  /** Hands out unique client IPs so per-IP @Throttle buckets stay isolated per test. */
  let ipCounter = 0;
  const nextIp = (): string => `10.4.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  /** Fresh phone per login: the OTP send cap (3/hour/phone) must never trip. */
  let phoneCounter = 0;
  const nextPhone = (): string => `0941${String(++phoneCounter).padStart(7, '0')}`;

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

  const PNG_BYTES = Buffer.from('89504e47-fake-png-bytes');

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'media-e2e-'));
    process.env.STORAGE_DIR = storageRoot;
    const testApp = await createTestApp();
    app = testApp.app;
    prisma = testApp.prisma;
    storage = app.get(StorageService);
    ownerId = prisma.seedUser({ phone: '09400000000', name: 'Media Owner' }).id;
    token = await login(nextPhone());
  });

  afterAll(async () => {
    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.STORAGE_DIR;
  });

  describe('GET /media/:year/:month/:file (public)', () => {
    it('streams the stored bytes with immutable cache headers and content-type from the ASSET row', async () => {
      const key = '2026/09/publicimage.jpg';
      prisma.seedMediaAsset({
        ownerId,
        type: MediaType.IMAGE,
        storageKey: key,
        // ext says jpg, row says png — the ROW decides the served content-type.
        mime: 'image/png',
        sizeBytes: PNG_BYTES.length,
      });
      await storage.put(key, PNG_BYTES, 'image/png');

      const response = await request(app.getHttpServer())
        .get('/media/2026/09/publicimage.jpg')
        .set('X-Forwarded-For', nextIp())
        .expect(200);
      expect(Buffer.from(response.body).equals(PNG_BYTES)).toBe(true);
      expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.headers['content-length']).toBe(String(PNG_BYTES.length));
    });

    it('is reachable without any Authorization header (true public route)', async () => {
      await request(app.getHttpServer())
        .get('/media/2026/09/publicimage.jpg')
        .set('X-Forwarded-For', nextIp())
        .expect(200);
    });

    it('404 for a pattern-valid but unknown key', async () => {
      const response = await request(app.getHttpServer())
        .get('/media/2026/09/nothing0000000000000000.jpg')
        .set('X-Forwarded-For', nextIp())
        .expect(404);
      expect(response.body.statusCode).toBe(404);
    });

    it('400 for a traversal key (URL-encoded ..) with INVALID_MEDIA_KEY', async () => {
      const response = await request(app.getHttpServer())
        .get('/media/..%2F..%2Fetc%2Fpasswd/2026/x.jpg')
        .set('X-Forwarded-For', nextIp())
        .expect(400);
      expect(response.body.code).toBe('INVALID_MEDIA_KEY');
    });

    it('400 for an absolute-path key and a pattern-violating filename', async () => {
      await request(app.getHttpServer())
        .get('/media/%2Fetc%2Fpasswd/2026/x.jpg')
        .set('X-Forwarded-For', nextIp())
        .expect(400);
      await request(app.getHttpServer())
        .get('/media/2026/09/x..jpg')
        .set('X-Forwarded-For', nextIp())
        .expect(400);
    });

    it('404 for malformed key shapes that match no route (never leaks the fs)', async () => {
      await request(app.getHttpServer())
        .get('/media/2026/09')
        .set('X-Forwarded-For', nextIp())
        .expect(404);
      await request(app.getHttpServer()).get('/media').set('X-Forwarded-For', nextIp()).expect(404);
    });
  });

  describe('GET /media/secure/:year/:month/:file (bearer-only)', () => {
    const CHAT_BYTES = Buffer.from('chat-video-frame');
    const chatKey = 'secure/2026/09/chatvideo.mp4';

    beforeAll(async () => {
      prisma.seedMediaAsset({
        ownerId,
        type: MediaType.VIDEO,
        storageKey: chatKey,
        mime: 'video/mp4',
        sizeBytes: CHAT_BYTES.length,
      });
      await storage.put(chatKey, CHAT_BYTES, 'video/mp4');
    });

    it('401 for anonymous callers', async () => {
      const response = await request(app.getHttpServer())
        .get('/media/secure/2026/09/chatvideo.mp4')
        .set('X-Forwarded-For', nextIp())
        .expect(401);
      expect(response.body.statusCode).toBe(401);
    });

    it('401 for an invalid token', async () => {
      await request(app.getHttpServer())
        .get('/media/secure/2026/09/chatvideo.mp4')
        .set('Authorization', 'Bearer not-a-real-token')
        .set('X-Forwarded-For', nextIp())
        .expect(401);
    });

    it('streams with a token: bytes + content-type from the row, private no-store cache', async () => {
      const response = await request(app.getHttpServer())
        .get('/media/secure/2026/09/chatvideo.mp4')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Forwarded-For', nextIp())
        .expect(200);
      expect(Buffer.from(response.body).equals(CHAT_BYTES)).toBe(true);
      expect(response.headers['content-type']).toBe('video/mp4');
      expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it('resolves the path after /media AS the key — a public asset is not reachable by splicing /secure/', async () => {
      const key = '2026/09/alsoserved.png';
      prisma.seedMediaAsset({
        ownerId,
        type: MediaType.IMAGE,
        storageKey: key, // public-pattern key only — no secure/ row exists
        mime: 'image/png',
        sizeBytes: PNG_BYTES.length,
      });
      await storage.put(key, PNG_BYTES, 'image/png');
      // /media/secure/2026/09/alsoserved.png would resolve storageKey
      // 'secure/2026/09/alsoserved.png' — which was never stored → 404.
      await request(app.getHttpServer())
        .get('/media/secure/2026/09/alsoserved.png')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Forwarded-For', nextIp())
        .expect(404);
    });

    it('400 for traversal with a valid token (pattern guard runs after authentication)', async () => {
      const response = await request(app.getHttpServer())
        .get('/media/secure/..%2F..%2Fetc/2026/x.jpg')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Forwarded-For', nextIp())
        .expect(400);
      expect(response.body.code).toBe('INVALID_MEDIA_KEY');
    });
  });

  it('driver bound in the module writes under STORAGE_DIR (config wiring)', async () => {
    const config = app.get(ConfigService).get<AppConfig>('app');
    expect(config?.storage.dir).toBe(storageRoot);
    await storage.put('2026/09/wiringcheck.txt', Buffer.from('x'), 'application/octet-stream');
    const exists = await storage.exists('2026/09/wiringcheck.txt');
    expect(exists).toBe(true);
  });
});
