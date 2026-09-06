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
 * at module init). 2/day × cost 2 makes the video 429 reachable with a single
 * upload; jest isolates each spec file in its own process, so this never
 * affects the other suites.
 */
process.env.MAX_IMAGE_UPLOADS_PER_DAY = '2';

/* Synthetic video fixtures — hand-built boxes/headers, no binary fixtures
 * committed (card DoD fixture files are replaced by in-process generation,
 * same decision as the MEDIA-002 image e2e). The mp4 carries exactly what the
 * sniff + mvhd parser read; the webm is an EBML header + filler. */

function box(type: string, payload: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length + 8, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, payload]);
}

function mp4Of(durationMs: number, timescale = 1000): Buffer {
  const mvhd = Buffer.alloc(20);
  mvhd.writeUInt8(0, 0);
  mvhd.writeUInt32BE(timescale, 12);
  mvhd.writeUInt32BE(durationMs, 16);
  return Buffer.concat([
    box('ftyp', Buffer.from('isomiso2avc1mp41', 'latin1')),
    box('moov', box('mvhd', mvhd)),
  ]);
}

const webmOf = (): Buffer =>
  Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(32, 0x42)]);

/**
 * POST /media/video e2e (MEDIA-003) — the real app (JWT guard, throttler,
 * FileFieldsInterceptor, global filter + validation pipe) against FakePrisma
 * and a real local-disk driver over a temp STORAGE_DIR. Covers: anonymous
 * 401, happy mp4+poster (URLs stream via the PUBLIC route, row contract),
 * webm trusting the client durationMs, over-duration 422 (incl. the 1 s
 * tolerance), missing durationMs 400, forged video 415, oversize 413 (multer
 * layer), daily quota 429 with the double-count, missing video field 400.
 */
describe('POST /media/video (e2e, MEDIA-003)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  let storageRoot: string;

  /** Hands out unique client IPs so per-IP @Throttle buckets stay isolated per test. */
  let ipCounter = 0;
  const nextIp = (): string => `10.6.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  /** Fresh phone per login: the OTP send cap (3/hour/phone) must never trip. */
  let phoneCounter = 0;
  const nextPhone = (): string => `0971${String(++phoneCounter).padStart(7, '0')}`;

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

  const posterPng = sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 5, g: 99, b: 180 } },
  })
    .png()
    .toBuffer();

  const uploadVideo = (
    token: string,
    video: Buffer,
    options: {
      mimetype?: string;
      poster?: Buffer;
      posterMimetype?: string;
      durationMs?: number;
    } = {},
  ) => {
    const req = request(app.getHttpServer())
      .post('/media/video')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp())
      .attach('video', video, {
        filename: options.mimetype === 'video/webm' ? 'clip.webm' : 'clip.mp4',
        contentType: options.mimetype ?? 'video/mp4',
      });
    if (options.poster !== undefined) {
      req.attach('poster', options.poster, {
        filename: 'poster.png',
        contentType: options.posterMimetype ?? 'image/png',
      });
    }
    if (options.durationMs !== undefined) {
      req.field('durationMs', String(options.durationMs));
    }
    return req;
  };

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'media-video-e2e-'));
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
      .post('/media/video')
      .set('X-Forwarded-For', nextIp())
      .attach('video', mp4Of(5_000), { filename: 'clip.mp4', contentType: 'video/mp4' })
      .expect(401);
  });

  it('stores an mp4 + poster: response contract, row contract, URLs stream (public route)', async () => {
    const token = await login(nextPhone());
    const response = await uploadVideo(token, mp4Of(5_000), {
      poster: await posterPng,
      durationMs: 999, // lying client — the mvhd parse (5 s) must win
    }).expect(201);

    // Response contract: {id, urls:{video, poster, posterThumb}, durationMs}.
    expect(typeof response.body.id).toBe('string');
    expect(response.body.durationMs).toBe(5_000);
    const urls = response.body.urls;
    expect(urls.video).toMatch(/^http:\/\/localhost:3001\/media\/\d{4}\/\d{2}\/[a-z0-9]+\.mp4$/);
    expect(urls.poster).toMatch(/^http:\/\/localhost:3001\/media\/\d{4}\/\d{2}\/[a-z0-9]+p\.png$/);
    expect(urls.posterThumb).toMatch(
      /^http:\/\/localhost:3001\/media\/\d{4}\/\d{2}\/[a-z0-9]+pt\.webp$/,
    );

    // Row: type VIDEO, storageKey = video, thumbKey = POSTER THUMB, mp4 mime.
    const row = await prisma.mediaAsset.findUnique({ where: { id: response.body.id } });
    expect(row).toMatchObject({
      type: MediaType.VIDEO,
      storageKey: urls.video.slice('http://localhost:3001/media/'.length),
      thumbKey: urls.posterThumb.slice('http://localhost:3001/media/'.length),
      mime: 'video/mp4',
      durationMs: 5_000,
    });

    // The video URL streams 200 from the PUBLIC route with the row's mime.
    const videoStream = await request(app.getHttpServer())
      .get(new URL(urls.video).pathname)
      .set('X-Forwarded-For', nextIp())
      .expect(200);
    expect(videoStream.headers['content-type']).toBe('video/mp4');
    expect(videoStream.headers['cache-control']).toContain('immutable');

    // The poster thumb is a real 480w WebP served with the derived mime.
    const thumbStream = await request(app.getHttpServer())
      .get(new URL(urls.posterThumb).pathname)
      .set('X-Forwarded-For', nextIp())
      .expect(200);
    expect(thumbStream.headers['content-type']).toBe('image/webp');
    const meta = await sharp(thumbStream.body).metadata();
    expect(meta.width).toBe(480);
    expect(meta.height).toBe(320);

    // The poster ORIGINAL also streams (rowless key → mime from extension).
    const posterStream = await request(app.getHttpServer())
      .get(new URL(urls.poster).pathname)
      .set('X-Forwarded-For', nextIp())
      .expect(200);
    expect(posterStream.headers['content-type']).toBe('image/png');
  });

  it('webm without poster: client durationMs trusted, bare urls, streams as video/webm', async () => {
    const token = await login(nextPhone());
    const response = await uploadVideo(token, webmOf(), {
      mimetype: 'video/webm',
      durationMs: 7_500,
    }).expect(201);
    expect(response.body.durationMs).toBe(7_500);
    expect(response.body.urls.poster).toBeUndefined();
    expect(response.body.urls.posterThumb).toBeUndefined();

    const stream = await request(app.getHttpServer())
      .get(new URL(response.body.urls.video).pathname)
      .set('X-Forwarded-For', nextIp())
      .expect(200);
    expect(stream.headers['content-type']).toBe('video/webm');
  });

  it('422 DURATION_EXCEEDED for 62 s (limit 60 s + 1 s tolerance; 61 s passes)', async () => {
    const token = await login(nextPhone());
    const boundary = await uploadVideo(token, webmOf(), {
      mimetype: 'video/webm',
      durationMs: 61_000,
    }).expect(201);
    expect(boundary.body.durationMs).toBe(61_000);

    const rejected = await uploadVideo(token, webmOf(), {
      mimetype: 'video/webm',
      durationMs: 62_000,
    }).expect(422);
    expect(rejected.body.code).toBe('DURATION_EXCEEDED');
  });

  it('400 when a webm carries no durationMs (server cannot validate)', async () => {
    const token = await login(nextPhone());
    const response = await uploadVideo(token, webmOf(), { mimetype: 'video/webm' }).expect(400);
    expect(response.body.statusCode).toBe(400);
  });

  it('415 MEDIA_TYPE_MISMATCH for a forged video: JPEG bytes declared video/mp4', async () => {
    const token = await login(nextPhone());
    const jpeg = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 250, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    const response = await uploadVideo(token, jpeg, { mimetype: 'video/mp4' }).expect(415);
    expect(response.body.code).toBe('MEDIA_TYPE_MISMATCH');
  });

  it('413 when the multipart body exceeds the video size limit (multer layer)', async () => {
    const token = await login(nextPhone());
    const oversized = Buffer.alloc(50 * 1024 * 1024 + 1, 7);
    const response = await uploadVideo(token, oversized, { mimetype: 'video/mp4' }).expect(413);
    expect(response.body.statusCode).toBe(413);
  }, 30_000);

  it('429 QUOTA_EXCEEDED with the double-count: one video (cost 2) fills the 2/day bucket', async () => {
    const token = await login(nextPhone());
    await uploadVideo(token, webmOf(), { mimetype: 'video/webm', durationMs: 1_000 }).expect(201);
    const response = await uploadVideo(token, webmOf(), {
      mimetype: 'video/webm',
      durationMs: 1_000,
    }).expect(429);
    expect(response.body.code).toBe('QUOTA_EXCEEDED');

    // Quota is per owner — another user still uploads.
    const otherToken = await login(nextPhone());
    await uploadVideo(otherToken, webmOf(), {
      mimetype: 'video/webm',
      durationMs: 1_000,
    }).expect(201);
  });

  it('400 when the multipart request carries no video field', async () => {
    const token = await login(nextPhone());
    const response = await request(app.getHttpServer())
      .post('/media/video')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', nextIp())
      .attach('poster', await posterPng, { filename: 'poster.png', contentType: 'image/png' })
      .expect(400);
    expect(response.body.message).toContain('video');
  });
});
