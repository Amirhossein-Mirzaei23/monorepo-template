import { createReadStream } from 'node:fs';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { requireAppConfig } from '../../../config/configuration';
import { StorageService } from './storage.service';

/** Local filesystem implementation used in development and self-hosted runs. */
@Injectable()
export class LocalDiskDriver extends StorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    super();
    this.root = resolve(requireAppConfig(config).storage.dir);
  }

  async put(key: string, bytes: Buffer, _contentType: string): Promise<void> {
    const path = this.resolveKey(key);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, bytes);
  }

  get(key: string) {
    return createReadStream(this.resolveKey(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolveKey(key));
      return true;
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  private resolveKey(key: string): string {
    const path = resolve(this.root, key);
    const fromRoot = relative(this.root, path);
    if (
      !key ||
      isAbsolute(key) ||
      fromRoot === '..' ||
      fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    ) {
      throw new Error('Storage key resolves outside the storage root');
    }
    return path;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}