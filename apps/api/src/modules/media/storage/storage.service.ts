import type { Readable } from 'node:stream';

/**
 * Storage boundary for media bytes. Domain services depend on this contract;
 * MediaModule selects the concrete driver.
 */
export abstract class StorageService {
  abstract put(key: string, bytes: Buffer, contentType: string): Promise<void>;

  abstract get(key: string): Readable;

  abstract exists(key: string): Promise<boolean>;

  abstract delete(key: string): Promise<void>;
}