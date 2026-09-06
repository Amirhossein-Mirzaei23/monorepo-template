import {
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
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
import { ImageVariantService } from '../images/variant.service';
import { MediaRepository } from '../media.repository';
import {
  MEDIA_ERROR_CODES,
  MEDIA_PUBLIC_KEY_PATTERN,
  MEDIA_SECURE_KEY_PATTERN,
} from '../media.constants';
import { MediaService } from '../media.service';
import type { UploadedMediaFile } from '../media.service';
import { LocalDiskDriver } from '../storage/local-disk.driver';
import { StorageService } from '../storage/storage.service';

/** Grabs the rejection instead of try/catch noise in every test (same helper
 * style as lots.service.spec.ts). */
async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  return promise.then(
    () => {
      throw new Error('expected the promise to reject');
    },
    (error: Error) => error,
  );
}

/** Reads a driver stream to completion. */
async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Extracts the machine-readable code from a structured BadRequestException. */
function errorCodeOf(error: Error): unknown {
  return (error as BadRequestException).getResponse?.();
}

/** Shared typed-config stub (storage root + uploads limits) for both suites. */
let serviceConfig: AppConfig;

describe('MediaService (MEDIA-001)', () => {
  let service: MediaService;
  let storage: StorageService;
  let fake: FakePrisma;
  let ownerId: string;
  let root: string;

  /** Fixed date so key segments are deterministic: → 2026/11/. */
  const fixedDate = new Date('2026-11-05T10:00:00Z');

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'media-service-'));
    serviceConfig = {
      storage: { dir: root, publicMediaBaseUrl: 'http://localhost:3001/media' },
      uploads: {
        maxImageMb: 10,
        maxVideoMb: 50,
        maxLotImages: 15,
        maxLotVideos: 3,
        maxVideoSeconds: 60,
        // Small quota so the 429 branch is reachable without 200 uploads.
        dailyImageUploads: 3,
      },
    } as unknown as AppConfig;
    storage = new LocalDiskDriver({ get: () => serviceConfig } as unknown as ConfigService);
    fake = new FakePrisma();
    service = new MediaService(
      new MediaRepository(fake as unknown as PrismaService),
      storage,
      new ImageVariantService(),
      { get: () => serviceConfig } as unknown as ConfigService,
    );
    ownerId = fake.seedUser({ phone: '09111111111', name: 'Owner' }).id;
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('generateKey', () => {
    it('mints {yyyy}/{mm}/{24-char base36 id}.{ext} keys that satisfy the public pattern', () => {
      const key = service.generateKey('image/jpeg', fixedDate);
      expect(key).toMatch(/^2026\/11\//);
      expect(key).toMatch(MEDIA_PUBLIC_KEY_PATTERN);
      expect(key.split('/').pop()?.split('.').shift()).toHaveLength(24);
    });

    it('zero-pads the month', () => {
      expect(service.generateKey('image/png', new Date('2026-03-01T00:00:00Z'))).toMatch(
        /^2026\/03\//,
      );
    });

    it('maps each allowed mime to its extension', () => {
      expect(service.generateKey('image/jpeg', fixedDate)).toMatch(/\.jpg$/);
      expect(service.generateKey('image/png', fixedDate)).toMatch(/\.png$/);
      expect(service.generateKey('image/webp', fixedDate)).toMatch(/\.webp$/);
      expect(service.generateKey('video/mp4', fixedDate)).toMatch(/\.mp4$/);
      expect(service.generateKey('video/webm', fixedDate)).toMatch(/\.webm$/);
    });

    it('is case-insensitive on the mime', () => {
      expect(service.generateKey('IMAGE/JPEG', fixedDate)).toMatch(/\.jpg$/);
    });

    it('rejects unmapped mimes (incl. application/octet-stream) with UNSUPPORTED_MEDIA_TYPE', () => {
      for (const mime of ['application/octet-stream', 'image/heic', '']) {
        expect(() => service.generateKey(mime, fixedDate)).toThrow(BadRequestException);
        try {
          service.generateKey(mime, fixedDate);
        } catch (error) {
          const body = errorCodeOf(error as Error) as { code?: string };
          expect(body.code).toBe(MEDIA_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE);
        }
      }
    });

    it('generates unguessable, non-repeating keys', () => {
      const keys = new Set(Array.from({ length: 200 }, () => service.generateKey('image/webp')));
      expect(keys.size).toBe(200);
    });
  });

  describe('serving — pattern/traversal guard', () => {
    it('rejects keys containing .. with 400 INVALID_MEDIA_KEY (public route)', async () => {
      const error = await rejectionOf(service.servePublic('../../etc/passwd'));
      expect(error).toBeInstanceOf(BadRequestException);
      const body = errorCodeOf(error) as { code?: string };
      expect(body.code).toBe(MEDIA_ERROR_CODES.INVALID_MEDIA_KEY);
    });

    it('rejects absolute keys on both routes', async () => {
      await expect(rejectionOf(service.servePublic('/etc/passwd'))).resolves.toBeInstanceOf(
        BadRequestException,
      );
      await expect(rejectionOf(service.serveSecure('/etc/passwd'))).resolves.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects keys failing the public pattern (wrong shape, uppercase, bad ext)', async () => {
      for (const key of ['2026/1/abc.jpg', 'abc.jpg', '2026/01/ABC.jpg', '2026/01/abc.jpegx9']) {
        await expect(rejectionOf(service.servePublic(key))).resolves.toBeInstanceOf(
          BadRequestException,
        );
      }
    });

    it('rejects secure/-prefixed keys on the PUBLIC route but accepts them on the SECURE route', async () => {
      fake.seedMediaAsset({
        ownerId,
        type: MediaType.VIDEO,
        storageKey: 'secure/2026/01/chatvideo.mp4',
        mime: 'video/mp4',
        sizeBytes: 4,
      });
      await storage.put('secure/2026/01/chatvideo.mp4', Buffer.from('mp4!'), 'video/mp4');
      await expect(
        rejectionOf(service.servePublic('secure/2026/01/chatvideo.mp4')),
      ).resolves.toBeInstanceOf(BadRequestException);
      await expect(service.serveSecure('secure/2026/01/chatvideo.mp4')).resolves.toMatchObject({
        mime: 'video/mp4',
        secure: true,
      });
    });
  });

  describe('serving — lookups', () => {
    it('404 for a pattern-valid but unknown key', async () => {
      await expect(
        rejectionOf(service.servePublic('2026/01/unknown0001.jpg')),
      ).resolves.toBeInstanceOf(NotFoundException);
    });

    it('serves a stored asset: mime/size come from the ROW, stream yields the bytes', async () => {
      fake.seedMediaAsset({
        ownerId,
        type: MediaType.IMAGE,
        // ext says jpg, row says png — content-type must follow the ROW.
        storageKey: '2026/01/mimefromrow.jpg',
        mime: 'image/png',
        sizeBytes: 11,
      });
      await storage.put('2026/01/mimefromrow.jpg', Buffer.from('png-bytes!!'), 'image/png');
      const content = await service.servePublic('2026/01/mimefromrow.jpg');
      expect(content.mime).toBe('image/png');
      expect(content.sizeBytes).toBe(11);
      expect(content.secure).toBe(false);
      expect((await readAll(content.stream)).equals(Buffer.from('png-bytes!!'))).toBe(true);
    });

    it('404 when the row exists but the bytes are gone (inconsistent state)', async () => {
      fake.seedMediaAsset({
        ownerId,
        type: MediaType.IMAGE,
        storageKey: '2026/01/ghostfile.jpg',
        mime: 'image/jpeg',
        sizeBytes: 3,
      });
      await expect(
        rejectionOf(service.servePublic('2026/01/ghostfile.jpg')),
      ).resolves.toBeInstanceOf(NotFoundException);
    });

    it('secure route rejects public-pattern keys (path after /media IS the key — no splicing)', async () => {
      fake.seedMediaAsset({
        ownerId,
        type: MediaType.IMAGE,
        storageKey: '2026/01/alsopublic.png',
        mime: 'image/png',
        sizeBytes: 2,
      });
      await storage.put('2026/01/alsopublic.png', Buffer.from('ok'), 'image/png');
      // A public asset reached through the secure route would resolve the key
      // 'secure/2026/01/...' — it fails the mandatory-prefix pattern.
      await expect(
        rejectionOf(service.serveSecure('2026/01/alsopublic.png')),
      ).resolves.toBeInstanceOf(BadRequestException);
    });
  });

  describe('patterns (constants contract)', () => {
    it('secure pattern requires exactly the secure/ prefix on the public shape', () => {
      expect(MEDIA_SECURE_KEY_PATTERN.test('secure/2026/01/abc123.jpg')).toBe(true);
      expect(MEDIA_SECURE_KEY_PATTERN.test('2026/01/abc123.jpg')).toBe(false);
      expect(MEDIA_SECURE_KEY_PATTERN.test('secure/secure/2026/01/abc.jpg')).toBe(false);
      expect(MEDIA_SECURE_KEY_PATTERN.test('secure/2026/01/abc.jpg/extra')).toBe(false);
    });
  });
});

/**
 * MEDIA-002 upload pipeline (real sharp + real local-disk driver over a fresh
 * temp root; quota pinned to 3/day in serviceConfig).
 */
describe('MediaService uploadImage (MEDIA-002)', () => {
  let service: MediaService;
  let storage: StorageService;
  let fake: FakePrisma;
  let ownerId: string;
  let otherOwnerId: string;

  const URL_BASE = 'http://localhost:3001/media/';

  const makeFile = (
    buffer: Buffer,
    mimetype: string,
    size: number = buffer.length,
    originalname = 'upload.png',
  ): UploadedMediaFile => ({ buffer, mimetype, size, originalname });

  /** Real tiny fixtures generated in-process with sharp — no binaries committed. */
  const png40x30 = sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 10, b: 10 } },
  })
    .png()
    .toBuffer();
  const jpeg40x30 = sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 200, b: 10 } },
  })
    .jpeg()
    .toBuffer();

  beforeAll(async () => {
    // This suite owns the storage root for its driver; the MEDIA-001 suite's
    // driver already pinned the previous dir at construction, so re-pointing
    // the shared config here is safe.
    serviceConfig.storage.dir = await mkdtemp(join(tmpdir(), 'media-upload-'));
    storage = new LocalDiskDriver({ get: () => serviceConfig } as unknown as ConfigService);
    fake = new FakePrisma();
    service = new MediaService(
      new MediaRepository(fake as unknown as PrismaService),
      storage,
      new ImageVariantService(),
      { get: () => serviceConfig } as unknown as ConfigService,
    );
    ownerId = fake.seedUser({ phone: '09222222222', name: 'Uploader' }).id;
    otherOwnerId = fake.seedUser({ phone: '09333333333', name: 'Other Uploader' }).id;
  });

  it('stores original + derived cover/thumb keys, creates the row, returns absolute URLs', async () => {
    const png = await png40x30;
    const response = await service.uploadImage(ownerId, makeFile(png, 'image/png'));

    expect(response.width).toBe(40);
    expect(response.height).toBe(30);

    const originalKey = response.urls.original.slice(URL_BASE.length);
    const coverKey = response.urls.cover.slice(URL_BASE.length);
    const thumbKey = response.urls.thumb.slice(URL_BASE.length);
    // All three keys are public-pattern keys; variants are DERIVED from the
    // original id (`{id}c.webp` / `{id}t.webp`) so the URLs stay computable
    // from the row (no coverKey column, no migration on this card).
    for (const key of [originalKey, coverKey, thumbKey]) {
      expect(key).toMatch(MEDIA_PUBLIC_KEY_PATTERN);
    }
    expect(coverKey).toBe(originalKey.replace(/\.png$/, 'c.webp'));
    expect(thumbKey).toBe(originalKey.replace(/\.png$/, 't.webp'));
    for (const key of [originalKey, coverKey, thumbKey]) {
      expect(await storage.exists(key)).toBe(true);
    }

    // ONE row per upload: original key + thumb key + source mime + original size.
    const row = await fake.mediaAsset.findUnique({ where: { id: response.id } });
    expect(row).toMatchObject({
      ownerId,
      type: MediaType.IMAGE,
      storageKey: originalKey,
      thumbKey,
      mime: 'image/png',
      sizeBytes: png.length,
      width: 40,
      height: 30,
    });
  });

  it('keeps the original bytes as-received (JPEG stays JPEG under a .jpg key)', async () => {
    const jpeg = await jpeg40x30;
    const response = await service.uploadImage(
      ownerId,
      makeFile(jpeg, 'image/jpeg', jpeg.length, 'camera-photo.jpg'),
    );
    const originalKey = response.urls.original.slice(URL_BASE.length);
    expect(originalKey).toMatch(/\.jpg$/);
    const stored = await readAll(storage.get(originalKey));
    expect(stored.equals(jpeg)).toBe(true);
  });

  it('415 UNSUPPORTED_MEDIA_TYPE for a declared mime outside the allowlist', async () => {
    for (const mimetype of ['image/gif', 'application/octet-stream', '']) {
      const error = await rejectionOf(
        service.uploadImage(ownerId, makeFile(await png40x30, mimetype)),
      );
      expect(error).toBeInstanceOf(UnsupportedMediaTypeException);
      expect((errorCodeOf(error) as { code?: string }).code).toBe(
        MEDIA_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      );
    }
  });

  it('415 MEDIA_TYPE_MISMATCH for forged bytes: JPEG content named .png declared as image/png', async () => {
    const error = await rejectionOf(
      service.uploadImage(ownerId, makeFile(await jpeg40x30, 'image/png', undefined, 'forged.png')),
    );
    expect(error).toBeInstanceOf(UnsupportedMediaTypeException);
    expect((errorCodeOf(error) as { code?: string }).code).toBe(
      MEDIA_ERROR_CODES.MEDIA_TYPE_MISMATCH,
    );
  });

  it('413 IMAGE_TOO_LARGE when the buffered size exceeds uploads.maxImageMb', async () => {
    const error = await rejectionOf(
      service.uploadImage(ownerId, makeFile(await png40x30, 'image/png', 10 * 1024 * 1024 + 1)),
    );
    expect(error).toBeInstanceOf(PayloadTooLargeException);
    expect((errorCodeOf(error) as { code?: string }).code).toBe(MEDIA_ERROR_CODES.IMAGE_TOO_LARGE);
  });

  it('429 QUOTA_EXCEEDED at uploads.dailyImageUploads rows today — other users unaffected', async () => {
    // Dedicated user so the seeded rows can't leak into the other suites.
    const quotaOwnerId = fake.seedUser({ phone: '09444444444', name: 'Quota User' }).id;
    for (let i = 0; i < 3; i++) {
      fake.seedMediaAsset({
        ownerId: quotaOwnerId,
        type: MediaType.IMAGE,
        mime: 'image/png',
        sizeBytes: 1,
        createdAt: new Date(), // today → inside the quota window
      });
    }
    const error = await rejectionOf(
      service.uploadImage(quotaOwnerId, makeFile(await png40x30, 'image/png')),
    );
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((errorCodeOf(error) as { code?: string }).code).toBe(MEDIA_ERROR_CODES.QUOTA_EXCEEDED);

    // Quota is per owner — a fresh user still uploads.
    const response = await service.uploadImage(otherOwnerId, makeFile(await png40x30, 'image/png'));
    expect(response.id).toBeDefined();
  });

  it('rolls back and 500s when sharp cannot decode (magic passed, body is garbage)', async () => {
    const failingVariants = {
      sniffMime: (): 'image/png' => 'image/png',
      buildVariants: (): Promise<never> => Promise.reject(new Error('sharp exploded')),
    };
    const failingService = new MediaService(
      new MediaRepository(fake as unknown as PrismaService),
      storage,
      failingVariants as unknown as ImageVariantService,
      { get: () => serviceConfig } as unknown as ConfigService,
    );
    const rowsBefore = await fake.mediaAsset.count({ where: {} });

    const error = await rejectionOf(
      failingService.uploadImage(ownerId, makeFile(Buffer.from('not-an-image'), 'image/png')),
    );
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((errorCodeOf(error) as { code?: string }).code).toBe(
      MEDIA_ERROR_CODES.IMAGE_PROCESSING_FAILED,
    );
    // Nothing was stored and no row was created.
    expect(await fake.mediaAsset.count({ where: {} })).toBe(rowsBefore);
  });

  it('deletes already-stored keys when a later put fails (partial-key cleanup)', async () => {
    const realPut = storage.put.bind(storage);
    const putSpy = jest
      .spyOn(storage, 'put')
      .mockImplementation((key: string, buffer: Buffer, contentType: string) => {
        if (key.endsWith('c.webp')) {
          return Promise.reject(new Error('simulated disk full'));
        }
        return realPut(key, buffer, contentType);
      });

    const rowsBefore = await fake.mediaAsset.count({ where: { ownerId } });
    const error = await rejectionOf(
      service.uploadImage(ownerId, makeFile(await png40x30, 'image/png')),
    );
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((errorCodeOf(error) as { code?: string }).code).toBe(
      MEDIA_ERROR_CODES.IMAGE_PROCESSING_FAILED,
    );
    // The original bytes that WERE written got rolled back; no row survived.
    expect(await fake.mediaAsset.count({ where: { ownerId } })).toBe(rowsBefore);
    putSpy.mockRestore();
  });
});
