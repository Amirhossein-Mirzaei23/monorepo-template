import {
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaType } from '@prisma/client';
import sharp from 'sharp';
import { mkdtemp, rm } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../../../config/configuration';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { ChatMediaAccessService } from '../chat-media-access.service';
import { ImageVariantService } from '../images/variant.service';
import { MediaRepository } from '../media.repository';
import { MEDIA_ERROR_CODES, MEDIA_PUBLIC_KEY_PATTERN } from '../media.constants';
import { MediaService } from '../media.service';
import type { UploadedMediaFile } from '../media.service';
import { LocalDiskDriver } from '../storage/local-disk.driver';
import { StorageService } from '../storage/storage.service';
import { parseMp4DurationMs } from '../video/mp4-duration.parser';
import { sniffVideoMime, VideoService } from '../video/video.service';

/** Grabs the rejection instead of try/catch noise (same helper as media.service.spec). */
async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  return promise.then(
    () => {
      throw new Error('expected the promise to reject');
    },
    (error: Error) => error,
  );
}

function errorCodeOf(error: Error): unknown {
  return (error as BadRequestException).getResponse?.();
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/* Synthetic video fixtures — no binary files committed (same decision as the
 * image suites). The mp4 carries exactly what sniffVideoMime/parseMp4DurationMs
 * read (ftyp brand box + moov/mvhd); the webm is an EBML header + filler. */

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

const posterPng = sharp({
  create: { width: 600, height: 400, channels: 3, background: { r: 20, g: 130, b: 200 } },
})
  .png()
  .toBuffer();

/**
 * MEDIA-003 upload pipeline (real sharp + real local-disk driver over a fresh
 * temp root; shared quota pinned to 3/day so the double-count is reachable).
 */
describe('VideoService.uploadVideo (MEDIA-003)', () => {
  let service: VideoService;
  let storage: StorageService;
  let fake: FakePrisma;
  let ownerId: string;
  let root: string;
  let serviceConfig: AppConfig;

  const URL_BASE = 'http://localhost:3001/media/';

  const makeFile = (
    buffer: Buffer,
    mimetype: string,
    size: number = buffer.length,
    originalname = 'upload.bin',
  ): UploadedMediaFile => ({ buffer, mimetype, size, originalname });

  /**
   * Fresh owner per test that SUCCEEDS: the daily quota (3, cost 2 per video)
   * is shared per owner, so successful uploads each need their own bucket.
   * Tests that reject before the quota check can share the seeded ownerId.
   */
  let ownerCounter = 0;
  const nextOwner = (): string =>
    fake.seedUser({ phone: `0963${String(++ownerCounter).padStart(7, '0')}`, name: 'Video Owner' })
      .id;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'media-video-'));
    serviceConfig = {
      storage: { dir: root, publicMediaBaseUrl: 'http://localhost:3001/media' },
      uploads: {
        maxImageMb: 10,
        maxVideoMb: 50,
        maxLotImages: 15,
        maxLotVideos: 3,
        maxVideoSeconds: 60,
        // Small quota so the double-count 429 is reachable without 100 uploads.
        dailyImageUploads: 3,
      },
    } as unknown as AppConfig;
    storage = new LocalDiskDriver({ get: () => serviceConfig } as unknown as ConfigService);
    fake = new FakePrisma();
    const mediaService = new MediaService(
      new MediaRepository(fake as unknown as PrismaService),
      storage,
      new ImageVariantService(),
      new ChatMediaAccessService(fake as unknown as PrismaService),
      { get: () => serviceConfig } as unknown as ConfigService,
    );
    service = new VideoService(
      mediaService,
      new MediaRepository(fake as unknown as PrismaService),
      storage,
      new ImageVariantService(),
      { get: () => serviceConfig } as unknown as ConfigService,
    );
    ownerId = fake.seedUser({ phone: '09611111111', name: 'Video Uploader' }).id;
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('sniffs mp4 (ftyp at bytes 4–8) and webm (EBML header), null otherwise', () => {
    expect(sniffVideoMime(mp4Of(1_000))).toBe('video/mp4');
    expect(sniffVideoMime(webmOf())).toBe('video/webm');
    expect(sniffVideoMime(Buffer.from('plain text junk!'))).toBeNull();
    expect(sniffVideoMime(Buffer.alloc(0))).toBeNull();
  });

  it('stores video + poster pair: derived keys, row thumbKey = poster thumb, mvhd duration wins over the client', async () => {
    const owner = nextOwner();
    const video = mp4Of(5_000);
    const poster = await posterPng;
    const response = await service.uploadVideo(
      owner,
      makeFile(video, 'video/mp4'),
      999,
      makeFile(poster, 'image/png'),
    );

    expect(response.durationMs).toBe(5_000); // mvhd parse OVERRIDES the lying client 999

    const { poster: posterUrl, posterThumb: posterThumbUrl } = response.urls;
    if (!posterUrl || !posterThumbUrl) {
      throw new Error('expected poster + posterThumb URLs on a poster upload');
    }
    const videoKey = response.urls.video.slice(URL_BASE.length);
    const posterKey = posterUrl.slice(URL_BASE.length);
    const posterThumbKey = posterThumbUrl.slice(URL_BASE.length);
    // All three keys are public-pattern and DERIVED from the same id (p/pt
    // siblings — see derivePosterKeys), so URLs stay computable from the row.
    for (const key of [videoKey, posterKey, posterThumbKey]) {
      expect(key).toMatch(MEDIA_PUBLIC_KEY_PATTERN);
      expect(await storage.exists(key)).toBe(true);
    }
    expect(posterKey).toBe(videoKey.replace(/\.mp4$/, 'p.png'));
    expect(posterThumbKey).toBe(videoKey.replace(/\.mp4$/, 'pt.webp'));
    expect(
      videoKey
        .split('/')
        .pop()
        ?.replace(/\.mp4$/, ''),
    ).toHaveLength(24);

    // Bytes: original video kept as-received; poster thumb is a real 480w WebP.
    expect((await readAll(storage.get(videoKey))).equals(video)).toBe(true);
    const thumbMeta = await sharp(await readAll(storage.get(posterThumbKey))).metadata();
    expect(thumbMeta.format).toBe('webp');
    expect(thumbMeta.width).toBe(480);
    expect(thumbMeta.height).toBe(320);

    // ONE row: type VIDEO, thumbKey IS the poster thumb, no poster row added.
    const row = await fake.mediaAsset.findUnique({ where: { id: response.id } });
    expect(row).toMatchObject({
      ownerId: owner,
      type: MediaType.VIDEO,
      storageKey: videoKey,
      thumbKey: posterThumbKey,
      mime: 'video/mp4',
      sizeBytes: video.length,
      durationMs: 5_000,
    });
    expect(await fake.mediaAsset.count({ where: { ownerId: owner } })).toBe(1);
  });

  it('webm trusts the client durationMs; no poster → null thumbKey and bare urls', async () => {
    const owner = nextOwner();
    const response = await service.uploadVideo(owner, makeFile(webmOf(), 'video/webm'), 7_500);
    expect(response.durationMs).toBe(7_500);
    expect('poster' in response.urls).toBe(false);
    expect('posterThumb' in response.urls).toBe(false);
    const row = await fake.mediaAsset.findUnique({ where: { id: response.id } });
    expect(row).toMatchObject({ mime: 'video/webm', durationMs: 7_500, thumbKey: null });
  });

  it('unparseable mp4 falls back to the client durationMs', async () => {
    const noMoov = Buffer.concat([
      box('ftyp', Buffer.from('isom', 'latin1')),
      box('mdat', Buffer.alloc(16)),
    ]);
    expect(parseMp4DurationMs(noMoov)).toBeNull(); // fixture sanity
    const response = await service.uploadVideo(nextOwner(), makeFile(noMoov, 'video/mp4'), 3_000);
    expect(response.durationMs).toBe(3_000);
  });

  it('400 DURATION_REQUIRED when there is no usable duration (webm without the field)', async () => {
    const error = await rejectionOf(
      service.uploadVideo(ownerId, makeFile(webmOf(), 'video/webm'), undefined),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((errorCodeOf(error) as { code?: string }).code).toBe(
      MEDIA_ERROR_CODES.DURATION_REQUIRED,
    );
  });

  it('400 DURATION_REQUIRED for an unparseable mp4 with no client durationMs', async () => {
    const noMoov = Buffer.concat([
      box('ftyp', Buffer.from('isom', 'latin1')),
      box('mdat', Buffer.alloc(16)),
    ]);
    const error = await rejectionOf(
      service.uploadVideo(ownerId, makeFile(noMoov, 'video/mp4'), undefined),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((errorCodeOf(error) as { code?: string }).code).toBe(
      MEDIA_ERROR_CODES.DURATION_REQUIRED,
    );
  });

  it('422 DURATION_EXCEEDED when the SERVER-parsed duration is over — client value is ignored', async () => {
    // Client lies (1 s) but the mvhd box says 65 s: the parse wins and rejects.
    const error = await rejectionOf(
      service.uploadVideo(ownerId, makeFile(mp4Of(65_000), 'video/mp4'), 1_000),
    );
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect((errorCodeOf(error) as { code?: string }).code).toBe(
      MEDIA_ERROR_CODES.DURATION_EXCEEDED,
    );
  });

  it('tolerance boundary: 61 s (60 + 1) passes, 62 s fails — webm/client path', async () => {
    const boundary = await service.uploadVideo(
      nextOwner(),
      makeFile(webmOf(), 'video/webm'),
      61_000,
    );
    expect(boundary.durationMs).toBe(61_000);

    const error = await rejectionOf(
      service.uploadVideo(ownerId, makeFile(webmOf(), 'video/webm'), 62_000),
    );
    expect((errorCodeOf(error) as { code?: string }).code).toBe(
      MEDIA_ERROR_CODES.DURATION_EXCEEDED,
    );
  });

  it('415 UNSUPPORTED_MEDIA_TYPE for declared mimes outside the mp4/webm allowlist', async () => {
    for (const mimetype of ['image/png', 'video/quicktime', 'application/octet-stream', '']) {
      const error = await rejectionOf(
        service.uploadVideo(ownerId, makeFile(mp4Of(1_000), mimetype), 1_000),
      );
      expect(error).toBeInstanceOf(UnsupportedMediaTypeException);
      expect((errorCodeOf(error) as { code?: string }).code).toBe(
        MEDIA_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      );
    }
  });

  it('415 MEDIA_TYPE_MISMATCH for forged containers (declared mp4, webm bytes and vice versa)', async () => {
    for (const [mimetype, buffer] of [
      ['video/mp4', webmOf()],
      ['video/webm', mp4Of(1_000)],
    ] as const) {
      const error = await rejectionOf(
        service.uploadVideo(ownerId, makeFile(buffer, mimetype), 1_000),
      );
      expect(error).toBeInstanceOf(UnsupportedMediaTypeException);
      expect((errorCodeOf(error) as { code?: string }).code).toBe(
        MEDIA_ERROR_CODES.MEDIA_TYPE_MISMATCH,
      );
    }
  });

  it('413 VIDEO_TOO_LARGE when the buffered size exceeds uploads.maxVideoMb', async () => {
    const error = await rejectionOf(
      service.uploadVideo(
        ownerId,
        makeFile(mp4Of(1_000), 'video/mp4', 50 * 1024 * 1024 + 1),
        1_000,
      ),
    );
    expect(error).toBeInstanceOf(PayloadTooLargeException);
    expect((errorCodeOf(error) as { code?: string }).code).toBe(MEDIA_ERROR_CODES.VIDEO_TOO_LARGE);
  });

  it('poster gates: 415 for non-image, 415 for forged image bytes, 413 over the image cap', async () => {
    // Declared poster mime outside the image allowlist.
    const notImage = await rejectionOf(
      service.uploadVideo(
        ownerId,
        makeFile(mp4Of(1_000), 'video/mp4'),
        1_000,
        makeFile(mp4Of(1_000), 'video/mp4'),
      ),
    );
    expect((errorCodeOf(notImage) as { code?: string }).code).toBe(
      MEDIA_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
    );

    // JPEG bytes declared image/png — same forged-extension rule as MEDIA-002.
    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    const forged = await rejectionOf(
      service.uploadVideo(
        ownerId,
        makeFile(mp4Of(1_000), 'video/mp4'),
        1_000,
        makeFile(jpeg, 'image/png'),
      ),
    );
    expect((errorCodeOf(forged) as { code?: string }).code).toBe(
      MEDIA_ERROR_CODES.MEDIA_TYPE_MISMATCH,
    );

    // Poster over uploads.maxImageMb.
    const oversized = await rejectionOf(
      service.uploadVideo(
        ownerId,
        makeFile(mp4Of(1_000), 'video/mp4'),
        1_000,
        makeFile(await posterPng, 'image/png', 10 * 1024 * 1024 + 1),
      ),
    );
    expect(oversized).toBeInstanceOf(PayloadTooLargeException);
    expect((errorCodeOf(oversized) as { code?: string }).code).toBe(
      MEDIA_ERROR_CODES.IMAGE_TOO_LARGE,
    );
  });

  it('quota double-count: 2 rows today + cost 2 > limit 3 → 429; 1 row still passes', async () => {
    const quotaOwner = fake.seedUser({ phone: '09622222222', name: 'Quota Video' }).id;
    for (let i = 0; i < 2; i++) {
      fake.seedMediaAsset({
        ownerId: quotaOwner,
        type: MediaType.IMAGE,
        mime: 'image/png',
        sizeBytes: 1,
        createdAt: new Date(), // today → inside the quota window
      });
    }
    const rejected = await rejectionOf(
      service.uploadVideo(quotaOwner, makeFile(mp4Of(1_000), 'video/mp4'), 1_000),
    );
    expect(rejected).toBeInstanceOf(HttpException);
    expect((rejected as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((errorCodeOf(rejected) as { code?: string }).code).toBe(
      MEDIA_ERROR_CODES.QUOTA_EXCEEDED,
    );

    // 1 row + cost 2 = 3 ≤ 3 → the upload goes through.
    const ok = await service.uploadVideo(nextOwner(), makeFile(mp4Of(1_000), 'video/mp4'), 1_000);
    expect(ok.id).toBeDefined();
  });

  it('rolls back and 500s when the poster thumb pipeline fails (VIDEO_PROCESSING_FAILED)', async () => {
    const failingVariants = {
      sniffMime: (): 'image/png' => 'image/png',
      buildThumb: (): Promise<never> => Promise.reject(new Error('sharp exploded')),
    };
    const failingService = new VideoService(
      new MediaService(
        new MediaRepository(fake as unknown as PrismaService),
        storage,
        failingVariants as unknown as ImageVariantService,
        new ChatMediaAccessService(fake as unknown as PrismaService),
        { get: () => serviceConfig } as unknown as ConfigService,
      ),
      new MediaRepository(fake as unknown as PrismaService),
      storage,
      failingVariants as unknown as ImageVariantService,
      { get: () => serviceConfig } as unknown as ConfigService,
    );
    const rowsBefore = await fake.mediaAsset.count({ where: {} });

    const error = await rejectionOf(
      failingService.uploadVideo(
        ownerId,
        makeFile(mp4Of(1_000), 'video/mp4'),
        1_000,
        makeFile(await posterPng, 'image/png'),
      ),
    );
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((errorCodeOf(error) as { code?: string }).code).toBe(
      MEDIA_ERROR_CODES.VIDEO_PROCESSING_FAILED,
    );
    // Nothing was stored and no row was created (sharp ran BEFORE any put).
    expect(await fake.mediaAsset.count({ where: {} })).toBe(rowsBefore);
  });

  it('deletes already-stored keys when a later put fails (partial-key cleanup)', async () => {
    const realPut = storage.put.bind(storage);
    const putSpy = jest
      .spyOn(storage, 'put')
      .mockImplementation((key: string, buffer: Buffer, contentType: string) => {
        if (key.endsWith('pt.webp')) {
          return Promise.reject(new Error('simulated disk full'));
        }
        return realPut(key, buffer, contentType);
      });
    const rowsBefore = await fake.mediaAsset.count({ where: { ownerId } });

    const error = await rejectionOf(
      service.uploadVideo(
        ownerId,
        makeFile(mp4Of(1_000), 'video/mp4'),
        1_000,
        makeFile(await posterPng, 'image/png'),
      ),
    );
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((errorCodeOf(error) as { code?: string }).code).toBe(
      MEDIA_ERROR_CODES.VIDEO_PROCESSING_FAILED,
    );
    // The stored video key got rolled back and no row survived.
    expect(await fake.mediaAsset.count({ where: { ownerId } })).toBe(rowsBefore);
    putSpy.mockRestore();
  });
});
