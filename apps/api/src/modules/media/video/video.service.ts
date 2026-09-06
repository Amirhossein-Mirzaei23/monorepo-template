import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaType } from '@prisma/client';
import { requireAppConfig, type AppConfig } from '../../../config/configuration';
import {
  MEDIA_ERROR_CODES,
  MEDIA_MIME_EXTENSIONS,
  VIDEO_QUOTA_COST,
  derivePosterKeys,
} from '../media.constants';
import { MediaRepository } from '../media.repository';
import { MediaService, startOfUtcDay, type UploadedMediaFile } from '../media.service';
import { ImageVariantService } from '../images/variant.service';
import { StorageService } from '../storage/storage.service';
import type { MediaVideoUploadResponseDto } from '../dto/media-video-upload-response.dto';
import { parseMp4DurationMs } from './mp4-duration.parser';

/** The two containers this endpoint accepts (card: "accept mp4/webm"). */
export const VIDEO_MIME_ALLOWLIST: readonly string[] = ['video/mp4', 'video/webm'] as const;

export type SniffedVideoMime = 'video/mp4' | 'video/webm';

/**
 * Leading magic bytes → actual container. mp4: the brand box reads 'ftyp' at
 * bytes 4–8; WebM/Matroska: the EBML header 1A 45 DF A3 (an .mkv would also
 * sniff webm — accepted, same container family). Returns null for anything
 * else; the declared multipart mime is checked SEPARATELY, a disagreement is
 * the "forged extension" 415 (same contract as the image pipeline).
 */
export function sniffVideoMime(buffer: Buffer): SniffedVideoMime | null {
  if (buffer.length >= 8 && buffer.toString('latin1', 4, 8) === 'ftyp') {
    return 'video/mp4';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return 'video/webm';
  }
  return null;
}

/**
 * MEDIA-003 video upload pipeline: magic-byte verification, size cap,
 * duration enforcement (server mvhd parse for mp4, client value otherwise),
 * optional client-captured poster through the image pipeline, quota, storage
 * and row.
 *
 * Contract decisions (beyond MEDIA-002's, which carry over):
 * - Duration: client reports `durationMs` AND the server re-checks. For mp4
 *   the mvhd box is parsed (parseMp4DurationMs) and the PARSED value wins —
 *   a lying client cannot stretch the limit. If the parse fails (fragmented
 *   mp4, exotic headers) the client value is used as documented fallback; if
 *   there is none → 400 DURATION_REQUIRED (cannot validate). WebM has no
 *   cheap in-band duration without ffmpeg (D10) → client value is trusted
 *   (RESIDUAL RISK, accepted by the card: "webm trusts client flag").
 * - Limit is uploads.maxVideoSeconds + 1 s tolerance → 422 DURATION_EXCEEDED.
 * - Poster: optional; must pass the SAME image allowlist + magic-byte sniff
 *   as MEDIA-002 (415 otherwise) and the image size cap (413). It goes
 *   through the sharp pipeline as its 480w thumb; keys derive from the video
 *   key ({id}p.{ext} original, {id}pt.webp thumb — derivePosterKeys) and the
 *   row's thumbKey IS the poster thumb. The poster creates NO own row, so
 *   quota counts each video upload as VIDEO_QUOTA_COST (2) rows of the shared
 *   MEDIA-002 daily bucket.
 * - Any sharp/storage/row failure after bytes were stored rolls them back
 *   best-effort and surfaces as 500 VIDEO_PROCESSING_FAILED.
 */
@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    private readonly media: MediaService,
    private readonly repository: MediaRepository,
    private readonly storage: StorageService,
    private readonly variants: ImageVariantService,
    private readonly config: ConfigService,
  ) {}

  async uploadVideo(
    ownerId: string,
    video: UploadedMediaFile,
    clientDurationMs: number | undefined,
    poster?: UploadedMediaFile,
  ): Promise<MediaVideoUploadResponseDto> {
    const config = requireAppConfig(this.config);
    const declaredMime = video.mimetype?.toLowerCase() ?? '';

    // 415 (a): declared type outside the video allowlist (mp4/webm only).
    if (!VIDEO_MIME_ALLOWLIST.includes(declaredMime)) {
      throw new UnsupportedMediaTypeException({
        code: MEDIA_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        message: 'Unsupported video type',
      });
    }

    // 415 (b): bytes don't match the declaration — the forged-extension case.
    const sniffed = sniffVideoMime(video.buffer);
    if (sniffed !== declaredMime) {
      throw new UnsupportedMediaTypeException({
        code: MEDIA_ERROR_CODES.MEDIA_TYPE_MISMATCH,
        message: 'Video content does not match its declared type',
      });
    }

    // 413: explicit re-check of the buffered size (the FileInterceptor limit
    // already rejects at the multipart layer; this guards config drift).
    const maxVideoBytes = config.uploads.maxVideoMb * 1024 * 1024;
    if (video.size > maxVideoBytes) {
      throw new PayloadTooLargeException({
        code: MEDIA_ERROR_CODES.VIDEO_TOO_LARGE,
        message: `Video exceeds the ${config.uploads.maxVideoMb} MB limit`,
      });
    }

    // Duration resolution + 422 (60 s + 1 s tolerance, PLAT-003).
    const durationMs = this.resolveDurationMs(sniffed, video.buffer, clientDurationMs);
    const maxDurationMs = (config.uploads.maxVideoSeconds + 1) * 1000;
    if (durationMs > maxDurationMs) {
      throw new HttpException(
        {
          code: MEDIA_ERROR_CODES.DURATION_EXCEEDED,
          message: `Video exceeds the ${config.uploads.maxVideoSeconds} second limit`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Optional poster: SAME image validation as MEDIA-002 (allowlist + sniff
    // + size); keys derive from the video key below, thumb bytes are built
    // inside the try (a sharp failure rolls back zero keys).
    let posterUpload: { file: UploadedMediaFile; mime: string; extension: string } | undefined;
    if (poster) {
      const { mime, extension } = this.assertValidPoster(poster, config);
      posterUpload = { file: poster, mime, extension };
    }

    // 429: shared daily bucket — the video draws VIDEO_QUOTA_COST slots and
    // the poster adds none (no second row; derivePosterKeys doc).
    const used = await this.repository.countByOwnerSince(ownerId, startOfUtcDay(new Date()));
    if (used + VIDEO_QUOTA_COST > config.uploads.dailyImageUploads) {
      throw new HttpException(
        {
          code: MEDIA_ERROR_CODES.QUOTA_EXCEEDED,
          message: 'Daily upload quota exceeded',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const videoKey = this.media.generateKey(sniffed);
    const posterKeys = posterUpload
      ? derivePosterKeys(videoKey, posterUpload.extension)
      : undefined;
    const storedKeys: string[] = [];
    try {
      // sharp FIRST: a poster decode/encode failure rolls back zero keys.
      if (posterUpload && posterKeys) {
        const posterThumb = await this.variants.buildThumb(posterUpload.file.buffer);
        storedKeys.push(posterKeys.original, posterKeys.thumb);
        await this.storage.put(posterKeys.original, posterUpload.file.buffer, posterUpload.mime);
        await this.storage.put(posterKeys.thumb, posterThumb, 'image/webp');
      }
      storedKeys.push(videoKey);
      await this.storage.put(videoKey, video.buffer, sniffed);
      const asset = await this.repository.create({
        ownerId,
        type: MediaType.VIDEO,
        storageKey: videoKey,
        thumbKey: posterKeys?.thumb ?? null,
        mime: sniffed,
        sizeBytes: video.buffer.length,
        durationMs,
      });
      return {
        id: asset.id,
        urls: this.videoUrls(videoKey, posterKeys, config),
        durationMs,
      };
    } catch (error) {
      // Poster variant/storage/row failure → best-effort cleanup of anything
      // already written, then a uniform 500 (card: "as MEDIA-002").
      this.logger.error(
        error instanceof Error ? (error.stack ?? error.message) : String(error),
        `Video upload failed for user ${ownerId} — rolling back ${storedKeys.length} stored key(s)`,
      );
      await Promise.allSettled(storedKeys.map((key) => this.storage.delete(key)));
      throw new InternalServerErrorException({
        code: MEDIA_ERROR_CODES.VIDEO_PROCESSING_FAILED,
        message: 'Video processing failed',
      });
    }
  }

  /**
   * Duration in ms: for mp4 the server-parsed mvhd value WINS over the client
   * field; the client value is the documented fallback for unparseable mp4s
   * and the ONLY source for WebM (parseMp4DurationMs is mp4-only). No usable
   * duration at all → 400 DURATION_REQUIRED (the limit is unenforceable).
   */
  private resolveDurationMs(
    sniffed: SniffedVideoMime,
    buffer: Buffer,
    clientDurationMs: number | undefined,
  ): number {
    if (sniffed === 'video/mp4') {
      const parsed = parseMp4DurationMs(buffer);
      if (parsed !== null) {
        return parsed;
      }
    }
    if (clientDurationMs === undefined) {
      throw new BadRequestException({
        code: MEDIA_ERROR_CODES.DURATION_REQUIRED,
        message:
          'durationMs is required: the video duration could not be read server-side ' +
          '(WebM is not parsed; the mp4 mvhd box was not found)',
      });
    }
    return clientDurationMs;
  }

  /**
   * Poster gate — mirrors MediaService.uploadImage's image checks and returns
   * the sniff-verified mime + storage extension for key derivation. 415
   * outside the image allowlist or on byte/mime mismatch, 413 over the image
   * size cap.
   */
  private assertValidPoster(
    poster: UploadedMediaFile,
    config: AppConfig,
  ): { mime: string; extension: string } {
    const declaredMime = poster.mimetype?.toLowerCase() ?? '';
    const extension = MEDIA_MIME_EXTENSIONS[declaredMime];
    if (!extension || !declaredMime.startsWith('image/')) {
      throw new UnsupportedMediaTypeException({
        code: MEDIA_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        message: 'Poster must be a JPEG, PNG or WebP image',
      });
    }
    if (this.variants.sniffMime(poster.buffer) !== declaredMime) {
      throw new UnsupportedMediaTypeException({
        code: MEDIA_ERROR_CODES.MEDIA_TYPE_MISMATCH,
        message: 'Poster content does not match its declared type',
      });
    }
    const maxBytes = config.uploads.maxImageMb * 1024 * 1024;
    if (poster.size > maxBytes) {
      throw new PayloadTooLargeException({
        code: MEDIA_ERROR_CODES.IMAGE_TOO_LARGE,
        message: `Poster exceeds the ${config.uploads.maxImageMb} MB limit`,
      });
    }
    return { mime: declaredMime, extension };
  }

  /** Absolute URLs (PUBLIC_MEDIA_BASE_URL) for the video + optional poster pair. */
  private videoUrls(
    videoKey: string,
    posterKeys: { original: string; thumb: string } | undefined,
    config: AppConfig,
  ): MediaVideoUploadResponseDto['urls'] {
    const base = config.storage.publicMediaBaseUrl.replace(/\/+$/, '');
    const url = (key: string): string => `${base}/${key}`;
    return {
      video: url(videoKey),
      ...(posterKeys
        ? { poster: url(posterKeys.original), posterThumb: url(posterKeys.thumb) }
        : {}),
    };
  }
}
