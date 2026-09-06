import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Readable } from 'node:stream';
import {
  MEDIA_ERROR_CODES,
  MEDIA_MIME_EXTENSIONS,
  MEDIA_PUBLIC_KEY_PATTERN,
  MEDIA_SECURE_KEY_PATTERN,
  generateMediaId,
} from './media.constants';
import { MediaRepository } from './media.repository';
import { StorageService } from './storage/storage.service';

/** What a serving endpoint needs to stream one stored object. */
export interface MediaContent {
  stream: Readable;
  /** From the STORED MediaAsset row — never from the request. */
  mime: string;
  sizeBytes: number;
  mediaAssetId: string;
  /** Whether the key carried the `secure/` prefix (chat media). */
  secure: boolean;
}

/**
 * Media business rules (MEDIA-001): storage-key generation and the
 * public/secure serving decisions. Upload pipelines (multipart, variants,
 * quotas) arrive with MEDIA-002/003 — this service only owns what serving and
 * key minting need today.
 *
 * Serving contract (the card, verbatim where it matters):
 * - Content-type comes from the STORED asset row, never from the request.
 * - 404 for unknown keys; 400 for keys failing the pattern/traversal guard.
 * - The public route resolves public-pattern keys only; the secure route
 *   resolves `secure/`-prefixed keys only (the path after /media IS the key).
 * - The secure route is bearer-authenticated ONLY (any valid account) on this
 *   card — per-message authorization is chat territory (CHT) and lands there;
 *   chat media keys are unguessable random paths, which is the residual guard.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly repository: MediaRepository,
    private readonly storage: StorageService,
  ) {}

  /**
   * Mints a fresh storage key `{yyyy}/{mm}/{id}.{ext}` for the given mime.
   * The extension is derived from the STORED mime (the allowlist map); an
   * unmapped mime (incl. application/octet-stream) is rejected here so no key
   * can ever exist for a type we don't serve. Called by the upload pipelines
   * (MEDIA-002/003); unit-tested here so the contract is pinned from day one.
   */
  generateKey(contentType: string, now: Date = new Date()): string {
    const extension = MEDIA_MIME_EXTENSIONS[contentType.toLowerCase()];
    if (!extension) {
      throw new BadRequestException({
        code: MEDIA_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        message: 'Unsupported media type',
      });
    }
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}/${month}/${generateMediaId()}.${extension}`;
  }

  /**
   * Resolves a public-route key (`GET /media/:key`) to streamable content.
   * Only public-pattern keys (lot variants/avatars) are ever reachable here —
   * `secure/`-prefixed keys fail the pattern and are rejected with 400 before
   * any lookup.
   */
  servePublic(key: string): Promise<MediaContent> {
    return this.serve(key, MEDIA_PUBLIC_KEY_PATTERN);
  }

  /**
   * Resolves a secure-route key (`GET /media/secure/:key`) to streamable
   * content. Bearer-authenticated (global JwtAuthGuard — the route is not
   * @Public); the URL path after /media IS the storage key, so only
   * `secure/`-prefixed (chat) keys resolve here.
   */
  serveSecure(key: string): Promise<MediaContent> {
    return this.serve(key, MEDIA_SECURE_KEY_PATTERN);
  }

  private async serve(key: string, pattern: RegExp): Promise<MediaContent> {
    this.assertServableKey(key, pattern);

    const asset = await this.repository.findByStorageKey(key);
    if (!asset) {
      throw new NotFoundException('Media not found');
    }
    if (!(await this.storage.exists(key))) {
      // Row without bytes: inconsistent state — surface as 404 (same contract
      // as an unknown key), never as a driver crash.
      throw new NotFoundException('Media not found');
    }
    return {
      stream: this.storage.get(key),
      mime: asset.mime,
      sizeBytes: asset.sizeBytes,
      mediaAssetId: asset.id,
      secure: key.startsWith('secure/'),
    };
  }

  /**
   * Path-traversal guard (MEDIA-001 "Validation"): a key containing `..`,
   * a NUL byte, an absolute path, or failing its route's pattern is rejected
   * with 400 INVALID_MEDIA_KEY before it touches the driver, the repository,
   * or the filesystem.
   */
  private assertServableKey(key: string, pattern: RegExp): void {
    if (key.includes('..') || key.includes('\0') || key.startsWith('/') || !pattern.test(key)) {
      throw new BadRequestException({
        code: MEDIA_ERROR_CODES.INVALID_MEDIA_KEY,
        message: 'Invalid media key',
      });
    }
  }
}
