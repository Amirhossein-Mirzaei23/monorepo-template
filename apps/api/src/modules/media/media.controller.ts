import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { pipeline } from 'node:stream';
import { Public } from '../../common/decorators/public.decorator';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { MediaUploadResponseDto } from './dto/media-upload-response.dto';
import { MediaVideoUploadResponseDto } from './dto/media-video-upload-response.dto';
import { VideoUploadDto } from './dto/video-upload.dto';
import { MEDIA_UPLOAD_THROTTLE } from './media.constants';
import type { MediaContent, UploadedMediaFile } from './media.service';
import { MediaService } from './media.service';
import { VideoService } from './video/video.service';

/**
 * Static mirror of uploads.maxImageMb (same env var, same 10 MB default — see
 * configuration.ts). Decorator options evaluate ONCE at boot, before any
 * ConfigService exists, so the multipart limit cannot read typed config; the
 * service re-checks file.size against the typed config anyway (defense in
 * depth), and both layers disagree only if someone changes one env read.
 * MemoryStorage is multer's default when no `dest`/`storage` is given: bytes
 * land in `file.buffer` and never on disk under a client-controlled name.
 */
const MULTER_FILE_SIZE_LIMIT_BYTES =
  (Number.parseInt(process.env.MAX_IMAGE_MB ?? '10', 10) || 10) * 1024 * 1024;

/**
 * Same static mirror for the VIDEO route (uploads.maxVideoMb, 50 MB default).
 * multer's per-part `fileSize` limit applies to EACH file field, so a 10 MB
 * poster passes the multipart layer under the 50 MB video cap; VideoService
 * re-checks video (maxVideoMb) and poster (maxImageMb) against typed config.
 */
const MULTER_VIDEO_FILE_SIZE_LIMIT_BYTES =
  (Number.parseInt(process.env.MAX_VIDEO_MB ?? '50', 10) || 50) * 1024 * 1024;

/**
 * Media serving (MEDIA-001) + image upload (MEDIA-002). Storage keys are
 * `{yyyy}/{mm}/{id}.{ext}`, so a key is always exactly three segments (plus
 * the `secure/` prefix on the bearer route) — the routes below bind one param
 * per segment instead of a slash-spanning wildcard, and MediaService
 * re-validates the reassembled key against the pattern/traversal guard (400)
 * before anything touches the driver. Content-type always comes from the
 * stored MediaAsset row (or, for rowless MEDIA-002 variant objects, from the
 * server-minted key's own extension — never from a request header).
 *
 * GET /media/:year/:month/:file        — @Public, immutable cache headers
 *   (keys are unguessable and content is immutable; only lot variants/avatars
 *   mint public keys). GET /media/secure/... — JWT (global guard, no @Public),
 *   `private, no-store`: authenticated chat media must not sit in shared
 *   caches. Per-message authorization arrives with chat (CHT); the unguessable
 *   random key is the guard on this card.
 * POST /media — JWT (any account), 30/min throttle, multipart `file`:
 *   verified image → original + cover/thumb WebP variants (MEDIA-002).
 * POST /media/video — JWT (any account), same throttle, multipart `video` +
 *   optional `poster` + `durationMs`: verified mp4/WebM ≤ 50 MB and ≤ 60 s
 *   (+1 s tolerance; server mvhd parse for mp4) → VIDEO row, poster thumb
 *   through the sharp pipeline (MEDIA-003).
 */
@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly video: VideoService,
  ) {}

  @Post()
  @Throttle({ default: { limit: MEDIA_UPLOAD_THROTTLE.limit, ttl: MEDIA_UPLOAD_THROTTLE.ttlMs } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MULTER_FILE_SIZE_LIMIT_BYTES, files: 1 } }),
  )
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Image file: JPEG, PNG or WebP ≤ 10 MB. The declared Content-Type is verified ' +
            'against the magic bytes; filenames are ignored for storage.',
        },
      },
    },
  })
  @ApiOkResponse({ type: MediaUploadResponseDto })
  @ApiOperation({
    summary:
      'Upload an image (multipart `file`): stores the original plus 1200w/480w WebP variants',
  })
  async uploadImage(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedMediaFile | undefined,
  ): Promise<MediaUploadResponseDto> {
    if (!file) {
      throw new BadRequestException('Multipart field "file" is required');
    }
    return this.media.uploadImage(user.sub, file);
  }

  /**
   * MEDIA-003: two file fields share one multipart request, so the per-part
   * `fileSize` limit is the VIDEO cap (see MULTER_VIDEO_FILE_SIZE_LIMIT_BYTES
   * above) and the poster's own 10 MB cap is enforced in VideoService.
   * `durationMs` is a plain text field (multer puts it on the body) — the
   * DTO validates it; VideoService decides whether it is required and whether
   * the server-parsed mp4 duration overrides it.
   */
  @Post('video')
  @Throttle({ default: { limit: MEDIA_UPLOAD_THROTTLE.limit, ttl: MEDIA_UPLOAD_THROTTLE.ttlMs } })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'video', maxCount: 1 },
        { name: 'poster', maxCount: 1 },
      ],
      { limits: { fileSize: MULTER_VIDEO_FILE_SIZE_LIMIT_BYTES, files: 2 } },
    ),
  )
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['video'],
      properties: {
        video: {
          type: 'string',
          format: 'binary',
          description:
            'Video file: MP4 or WebM ≤ 50 MB and ≤ 60 s (+1 s tolerance). The declared ' +
            'Content-Type is verified against the magic bytes (ftyp / EBML); for MP4 the ' +
            'duration is re-parsed from the mvhd box, overriding the client value.',
        },
        poster: {
          type: 'string',
          format: 'binary',
          description:
            'Optional client-captured poster image: JPEG, PNG or WebP ≤ 10 MB; stored as ' +
            "the video row's poster (original + 480w WebP thumb).",
        },
        durationMs: {
          type: 'number',
          description:
            'Client-measured duration in ms. Required for WebM (no server-side parse) and ' +
            'as the fallback for unparseable MP4; validated server-side (≤ 61 s) and 422 ' +
            'DURATION_EXCEEDED otherwise.',
        },
      },
    },
  })
  @ApiOkResponse({ type: MediaVideoUploadResponseDto })
  @ApiOperation({
    summary:
      'Upload a video (multipart `video`, optional `poster` + `durationMs`): enforces the ' +
      'size/duration limits and stores the poster thumb',
  })
  async uploadVideo(
    @CurrentUser() user: AuthUser,
    @UploadedFiles()
    files: { video?: UploadedMediaFile[]; poster?: UploadedMediaFile[] } | undefined,
    @Body() body: VideoUploadDto,
  ): Promise<MediaVideoUploadResponseDto> {
    const video = files?.video?.[0];
    const poster = files?.poster?.[0];
    if (!video) {
      throw new BadRequestException('Multipart field "video" is required');
    }
    return this.video.uploadVideo(user.sub, video, body.durationMs, poster);
  }

  @Get('secure/:year/:month/:file')
  @ApiBearerAuth('access-token')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiOperation({
    summary:
      'Stream a bearer-only media asset by storage key — chat messages reference these; an asset referenced by any message requires conversation participation (403), others are authenticated-only (CHT-007)',
  })
  async serveSecure(
    @Res() res: Response,
    @CurrentUser() user: AuthUser,
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('file') file: string,
  ): Promise<void> {
    await this.stream(
      res,
      this.media.serveSecure(`secure/${year}/${month}/${file}`, user.sub),
      'private, no-store',
    );
  }

  @Get(':year/:month/:file')
  @Public()
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiOperation({
    summary: 'Stream a public media asset (lot image variants, avatars) by storage key',
  })
  async servePublic(
    @Res() res: Response,
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('file') file: string,
  ): Promise<void> {
    await this.stream(
      res,
      this.media.servePublic(`${year}/${month}/${file}`),
      'public, max-age=31536000, immutable',
    );
  }

  /**
   * Streams driver bytes with headers decided by the STORED asset
   * (MediaContent.mime — never the request). Content-Length is set only when
   * the size is known from the row; rowless MEDIA-002 variant objects (whose
   * byte sizes are not persisted) stream chunked. pipeline() forwards
   * backpressure and tears the response down if the stream errors mid-flight
   * (row exists but file vanished → destroyed response, no crash).
   */
  private async stream(
    res: Response,
    content: Promise<MediaContent>,
    cacheControl: 'public, max-age=31536000, immutable' | 'private, no-store',
  ): Promise<void> {
    const { stream, mime, sizeBytes } = await content;
    res.setHeader('Content-Type', mime);
    if (sizeBytes !== undefined) {
      res.setHeader('Content-Length', String(sizeBytes));
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', cacheControl);
    pipeline(stream, res, () => {
      // Errors after the headers are sent can only destroy the response —
      // the GlobalExceptionFilter can no longer help; nothing to log per-card.
    });
  }
}
