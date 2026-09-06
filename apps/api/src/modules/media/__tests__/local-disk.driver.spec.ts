import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration';
import { LocalDiskDriver } from '../storage/local-disk.driver';
import { StorageService } from '../storage/storage.service';

/**
 * Reads a driver stream to completion (what MediaController's pipeline does
 * against the HTTP response).
 */
async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await pipeline(stream, async function* (source) {
    for await (const chunk of source) {
      chunks.push(chunk as Buffer);
      yield chunk;
    }
  });
  return Buffer.concat(chunks);
}

describe('LocalDiskDriver (MEDIA-001)', () => {
  let root: string;
  let driver: StorageService;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'media-driver-'));
    const config = {
      storage: { dir: root, publicMediaBaseUrl: 'http://localhost:3001/media' },
    } as unknown as AppConfig;
    driver = new LocalDiskDriver({
      get: () => config,
    } as unknown as ConfigService);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('put creates parent directories and writes the bytes under the root', async () => {
    await driver.put('2026/09/abc123.jpg', Buffer.from('hello media'), 'image/jpeg');
    const written = await readFile(join(root, '2026', '09', 'abc123.jpg'));
    expect(written.equals(Buffer.from('hello media'))).toBe(true);
  });

  it('get streams the exact bytes back (put/get round-trip)', async () => {
    const payload = Buffer.from('round-trip-bytes');
    await driver.put('2026/01/roundtrip.png', payload, 'image/png');
    const read = await readAll(driver.get('2026/01/roundtrip.png'));
    expect(read.equals(payload)).toBe(true);
  });

  it('put overwrites an existing object with the new bytes', async () => {
    await driver.put('2026/01/overwrite.jpg', Buffer.from('first'), 'image/jpeg');
    await driver.put('2026/01/overwrite.jpg', Buffer.from('second'), 'image/jpeg');
    const read = await readAll(driver.get('2026/01/overwrite.jpg'));
    expect(read.equals(Buffer.from('second'))).toBe(true);
  });

  it('exists reports true for a stored object and false for a missing one', async () => {
    await driver.put('2026/02/exists.webm', Buffer.from('x'), 'video/webm');
    expect(await driver.exists('2026/02/exists.webm')).toBe(true);
    expect(await driver.exists('2026/02/missing.webm')).toBe(false);
  });

  it('delete removes the object and is idempotent for missing keys', async () => {
    await driver.put('2026/03/gone.mp4', Buffer.from('bye'), 'video/mp4');
    await driver.delete('2026/03/gone.mp4');
    expect(await driver.exists('2026/03/gone.mp4')).toBe(false);
    await expect(driver.delete('2026/03/gone.mp4')).resolves.toBeUndefined();
  });

  it('get on a missing object emits an async error (callers exists()-check first)', async () => {
    const stream = driver.get('2026/03/nothing.jpg');
    await expect(readAll(stream)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects traversal keys (..) without writing outside the root', async () => {
    await expect(driver.put('../escape.jpg', Buffer.from('no'), 'image/jpeg')).rejects.toThrow(
      /outside the storage root/,
    );
    expect(() => driver.get('../../etc/passwd')).toThrow(/outside the storage root/);
    // Nothing landed next to the root.
    await expect(stat(resolve(root, '..', 'escape.jpg'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects absolute keys', async () => {
    expect(() => driver.get('/etc/passwd')).toThrow(/outside the storage root/);
  });
});
