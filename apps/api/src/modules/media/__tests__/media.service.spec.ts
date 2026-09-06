import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaType } from '@prisma/client';
import { mkdtemp, rm } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../../../config/configuration';
import type { PrismaService } from '../../../prisma/prisma.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';
import { MediaRepository } from '../media.repository';
import {
  MEDIA_ERROR_CODES,
  MEDIA_PUBLIC_KEY_PATTERN,
  MEDIA_SECURE_KEY_PATTERN,
} from '../media.constants';
import { MediaService } from '../media.service';
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
    const config = {
      storage: { dir: root, publicMediaBaseUrl: 'http://localhost:3001/media' },
    } as unknown as AppConfig;
    storage = new LocalDiskDriver({ get: () => config } as unknown as ConfigService);
    fake = new FakePrisma();
    service = new MediaService(new MediaRepository(fake as unknown as PrismaService), storage);
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
