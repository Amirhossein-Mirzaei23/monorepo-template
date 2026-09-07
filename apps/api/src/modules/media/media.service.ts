import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'node:stream';
import { MediaType } from '@prisma/client';
import { requireAppConfig, type AppConfig } from '../../config/configuration';
import {
  MEDIA_ERROR_CODES,
  MEDIA_MIME_EXTENSIONS,
  MEDIA_PUBLIC_KEY_PATTERN,
  MEDIA_SECURE_PREFIX,
  MEDIA_SECURE_ROUTE_KEY_PATTERN,
  baseAssetKeyPrefixes,
  deriveVariantKey,
  generateMediaId,
  mimeFromKeyExtension,
} from './media.constants';
import { MediaRepository } from './media.repository';
import { ChatMediaAccessService } from './chat-media-access.service';
import { ImageVariantService } from './images/variant.service';
import { StorageService } from './storage/storage.service';
import type { MediaUploadResponseDto, MediaUploadUrlsDto } from './dto/media-upload-response.dto';

/**
 * One multer MemoryStorage file as the upload pipeline consumes it (the exact
 * surface @nestjs/platform-express's FileInterceptor puts on the request).
 * Declared locally — the repo deliberately has no @types/multer dependency.
 */
export interface UploadedMediaFile {
  /** Whole file in memory (memory storage) — capped by the interceptor limit. */
  buffer: Buffer;
  /** Declared multipart Content-Type — VERIFIED against magic bytes, never trusted. */
  mimetype: string;
  /** Decoded byte count set by multer. */
  size: number;
  /** Client filename — carried for logs only, NEVER used for storage keys. */
  originalname: string;
}

/** What a serving endpoint needs to stream one stored object. */
export interface MediaContent {
  stream: Readable;
  /** From the STORED MediaAsset row — never from the request. */
  mime: string;
  /**
   * From the row when one exists; undefined for rowless variant objects
   * (MEDIA-002 cover/thumb) whose byte sizes are not persisted — those
   * stream without a Content-Length header.
   */
  sizeBytes: number | undefined;
  mediaAssetId: string | undefined;
  /** Whether the key carried the `secure/` prefix (chat media). */
  secure: boolean;
}

/**
 * Media business rules (MEDIA-001 serving + MEDIA-002 image uploads):
 * storage-key minting, the public/secure serving decisions, and the multipart
 * image upload pipeline (magic-byte verification, size cap, daily quota,
 * sharp variants, storage + row).
 *
 * Serving contract (the card, verbatim where it matters):
 * - Content-type comes from the STORED MediaAsset row, never from the request.
 * - 404 for unknown keys; 400 for keys failing the pattern/traversal guard.
 * - The public route resolves public-pattern keys only; the secure route
 *   resolves `secure/`-prefixed keys AND (CHT-007) public-pattern keys — chat
 *   attachments are uploaded through the MEDIA-002/003 endpoints and mint
 *   public-pattern keys, so the bearer route must reach them.
 * - The secure route is bearer-authenticated; since CHT-007 an asset
 *   referenced by a chat Message additionally requires the requester to
 *   participate in one of the conversations carrying it (403 otherwise) —
 *   see serveSecure for the full matrix. Unreferenced assets stay
 *   authenticated-only here and public on the public route.
 * - MEDIA-002 addition: cover/thumb variant objects are stored WITHOUT their
 *   own MediaAsset row (one row per upload). For those pattern-valid,
 *   server-minted keys the fallback below derives the content-type from the
 *   KEY EXTENSION via the upload allowlist — a request header is still never
 *   trusted; unknown keys without bytes stay 404.
 *
 * Upload contract (MEDIA-002):
 * - Declared multipart mime must be allowlisted AND agree with the sniffed
 *   magic bytes (forged-extension files → 415 MEDIA_TYPE_MISMATCH).
 * - Size is capped by the FileInterceptor limit (413 at the multipart layer)
 *   and re-checked against config here (defense in depth, also 413).
 * - Per-user daily quota = MediaAsset rows created since UTC midnight vs
 *   uploads.dailyImageUploads (429 QUOTA_EXCEEDED).
 * - Variant keys are DERIVED from the original key (`{id}c.webp`,
 *   `{id}t.webp`) so the response URLs stay computable from the row forever.
 * - Any sharp/storage/row failure after bytes were stored is rolled back
 *   best-effort (key deletes) and surfaces as 500 IMAGE_PROCESSING_FAILED.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly repository: MediaRepository,
    private readonly storage: StorageService,
    private readonly variants: ImageVariantService,
    /**
     * CHT-007 — the chat-attachment authorization probes (message reference +
     * conversation participation) used by the secure serving route.
     */
    private readonly chatAccess: ChatMediaAccessService,
    private readonly config: ConfigService,
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
   * MEDIA-002 image upload: verify → quota → variants → store → row.
   * Filenames are never consulted for keys or types; the bytes themselves
   * decide (magic-byte sniff must agree with the declared multipart mime).
   * Variant keys derive from the original key (see deriveVariantKey) so the
   * URL triple stays computable from the stored row with no extra columns.
   */
  async uploadImage(ownerId: string, file: UploadedMediaFile): Promise<MediaUploadResponseDto> {
    const config = requireAppConfig(this.config);
    const declaredMime = file.mimetype?.toLowerCase() ?? '';

    // 415 (a): declared type outside the upload allowlist.
    const isDeclared = declaredMime in MEDIA_MIME_EXTENSIONS && declaredMime.startsWith('image/');
    if (!isDeclared) {
      throw new UnsupportedMediaTypeException({
        code: MEDIA_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        message: 'Unsupported media type',
      });
    }

    // 415 (b): bytes don't match the declaration — the forged-extension case.
    const sniffed = this.variants.sniffMime(file.buffer);
    if (sniffed !== declaredMime) {
      throw new UnsupportedMediaTypeException({
        code: MEDIA_ERROR_CODES.MEDIA_TYPE_MISMATCH,
        message: 'File content does not match its declared type',
      });
    }

    // 413: explicit re-check of the buffered size (the FileInterceptor limit
    // already rejects at the multipart layer; this guards config drift and any
    // route that ever reuses the pipeline without interceptor limits).
    const maxBytes = config.uploads.maxImageMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new PayloadTooLargeException({
        code: MEDIA_ERROR_CODES.IMAGE_TOO_LARGE,
        message: `Image exceeds the ${config.uploads.maxImageMb} MB limit`,
      });
    }

    // 429: soft daily quota — MediaAsset rows for this owner since UTC midnight.
    if (
      await this.hasReachedDailyQuota(
        ownerId,
        config.uploads.dailyImageUploads,
        startOfUtcDay(new Date()),
      )
    ) {
      throw new HttpException(
        {
          code: MEDIA_ERROR_CODES.QUOTA_EXCEEDED,
          message: 'Daily image upload quota exceeded',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const originalKey = this.generateKey(sniffed);
    const coverKey = deriveVariantKey(originalKey, 'cover');
    const thumbKey = deriveVariantKey(originalKey, 'thumb');
    const storedKeys: string[] = [];
    try {
      // sharp decode/encode — every failure below rolls back stored bytes.
      const variants = await this.variants.buildVariants(file.buffer);
      for (const [key, bytes, contentType] of [
        [originalKey, file.buffer, sniffed],
        [coverKey, variants.cover, 'image/webp'],
        [thumbKey, variants.thumb, 'image/webp'],
      ] as const) {
        storedKeys.push(key);
        await this.storage.put(key, bytes, contentType);
      }
      const asset = await this.repository.create({
        ownerId,
        type: MediaType.IMAGE,
        storageKey: originalKey,
        thumbKey,
        mime: sniffed,
        sizeBytes: file.buffer.length,
        width: variants.width,
        height: variants.height,
      });
      return {
        id: asset.id,
        urls: this.uploadUrls(originalKey, coverKey, thumbKey, config),
        width: variants.width,
        height: variants.height,
      };
    } catch (error) {
      // Variant/storage/row failure → best-effort cleanup of anything already
      // written, then a uniform 500 (card: "500 variant failure, cleanup").
      this.logger.error(
        error instanceof Error ? (error.stack ?? error.message) : String(error),
        `Image upload failed for user ${ownerId} — rolling back ${storedKeys.length} stored key(s)`,
      );
      await Promise.allSettled(storedKeys.map((key) => this.storage.delete(key)));
      throw new InternalServerErrorException({
        code: MEDIA_ERROR_CODES.IMAGE_PROCESSING_FAILED,
        message: 'Image processing failed',
      });
    }
  }

  /** Quota probe, split out for readability (count is repository-owned). */
  private async hasReachedDailyQuota(
    ownerId: string,
    dailyLimit: number,
    since: Date,
  ): Promise<boolean> {
    const used = await this.repository.countByOwnerSince(ownerId, since);
    return used >= dailyLimit;
  }

  /** Absolute URLs (PUBLIC_MEDIA_BASE_URL) — clients stream them from GET /media/:key. */
  private uploadUrls(
    originalKey: string,
    coverKey: string,
    thumbKey: string,
    config: AppConfig,
  ): MediaUploadUrlsDto {
    const base = config.storage.publicMediaBaseUrl.replace(/\/+$/, '');
    const url = (key: string): string => `${base}/${key}`;
    return { original: url(originalKey), cover: url(coverKey), thumb: url(thumbKey) };
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
   * content — bearer-authenticated (global JwtAuthGuard — the route is not
   * @Public). CHT-007 extends MEDIA-001's authenticated-only contract with
   * the PARTICIPANT gate:
   *
   * - an asset referenced by any Message is chat-attached: the requester must
   *   participate in one of those conversations — 403 SECURE_MEDIA_FORBIDDEN
   *   otherwise (the card's acceptance: a non-participant cannot fetch a chat
   *   media URL);
   * - assets NOT referenced by messages keep the unchanged contract:
   *   authenticated-only here (secure/-prefixed keys), public on the public
   *   route.
   *
   * KEY RESOLUTION (documented; the controller assembles `secure/…` + path):
   * 1. the requested key resolves in its own namespace — exact row, then the
   *    rowless VARIANT keys ({id}c.webp / {id}t.webp / {id}p.* / {id}pt.webp)
   *    via the documented id-prefix probes (baseAssetKeyPrefixes);
   * 2. CHT-007 chat media: attachments upload through MEDIA-002/003, which
   *    mint PUBLIC-pattern keys, so the route ALSO resolves the key without
   *    the `secure/` prefix — but ONLY when the inner asset is chat-attached
   *    (then the INNER key streams: the bytes live there). A public-pattern
   *    asset NOT referenced by any message stays unresolvable here (the
   *    rowless fallback 404s — MEDIA-001's "no splicing" contract stands; its
   *    bytes remain public via the public route, so nothing is hidden there).
   */
  async serveSecure(key: string, requesterId: string): Promise<MediaContent> {
    this.assertServableKey(key, MEDIA_SECURE_ROUTE_KEY_PATTERN);

    // 1) in-namespace resolution + participant gate.
    const direct = await this.resolveBaseAsset(key);
    if (direct) {
      await this.gateOnChatAsset(direct, requesterId);
      return this.serve(key, MEDIA_SECURE_ROUTE_KEY_PATTERN);
    }

    // 2) chat media uploaded under a public-pattern key.
    if (key.startsWith(MEDIA_SECURE_PREFIX)) {
      const inner = key.slice(MEDIA_SECURE_PREFIX.length);
      const innerBase = await this.resolveBaseAsset(inner);
      if (innerBase && (await this.chatAccess.isReferencedByMessage(innerBase.id))) {
        if (!(await this.chatAccess.requesterParticipates(innerBase.id, requesterId))) {
          throw new ForbiddenException({
            code: MEDIA_ERROR_CODES.SECURE_MEDIA_FORBIDDEN,
            message: 'You do not have access to this media',
          });
        }
        return this.serve(inner, MEDIA_PUBLIC_KEY_PATTERN);
      }
    }

    // Nothing resolved → the regular contract (unknown key → 404).
    return this.serve(key, MEDIA_SECURE_ROUTE_KEY_PATTERN);
  }

  /** The chat-attachment gate: 403 unless the requester participates in a
   * conversation carrying this asset (only message-referenced assets gate). */
  private async gateOnChatAsset(asset: { id: string }, requesterId: string): Promise<void> {
    if (await this.chatAccess.isReferencedByMessage(asset.id)) {
      const participates = await this.chatAccess.requesterParticipates(asset.id, requesterId);
      if (!participates) {
        throw new ForbiddenException({
          code: MEDIA_ERROR_CODES.SECURE_MEDIA_FORBIDDEN,
          message: 'You do not have access to this media',
        });
      }
    }
  }

  /**
   * The base-asset resolution for the participant gate: the EXACT storage key
   * first (original keys have rows), then — for rowless VARIANT keys — the
   * documented id-prefix probes (baseAssetKeyPrefixes). Null when nothing
   * resolves (unknown keys → the regular 404 path; no gate decision either
   * way).
   */
  private async resolveBaseAsset(key: string) {
    const exact = await this.repository.findByStorageKey(key);
    if (exact) {
      return exact;
    }
    for (const prefix of baseAssetKeyPrefixes(key)) {
      const found = await this.repository.findFirstByStorageKeyPrefix(prefix);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private async serve(key: string, pattern: RegExp): Promise<MediaContent> {
    this.assertServableKey(key, pattern);

    const asset = await this.repository.findByStorageKey(key);
    if (asset) {
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

    // Rowless object (MEDIA-002 variant keys — cover/thumb have no own row).
    // The key is server-minted and pattern-checked, so its extension decides
    // the served content-type via the upload allowlist; a key whose extension
    // is not allowlisted, or whose bytes don't exist, stays 404 — the MEDIA-001
    // "unknown key" contract is unchanged for everything clients could forge.
    const mime = mimeFromKeyExtension(key);
    if (!mime || !(await this.storage.exists(key))) {
      throw new NotFoundException('Media not found');
    }
    return {
      stream: this.storage.get(key),
      mime,
      sizeBytes: undefined,
      mediaAssetId: undefined,
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

/** Quota window: the current UTC day's midnight (quota is per calendar day). */
export function startOfUtcDay(now: Date): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}
