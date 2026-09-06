import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { MEDIA_UPLOAD_THROTTLE } from './media.constants';
import type { MediaContent, UploadedMediaFile } from './media.service';
import { MediaService } from './media.service';

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
 */
@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

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

  @Get('secure/:year/:month/:file')
  @ApiBearerAuth('access-token')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiOperation({ summary: 'Stream a bearer-only media asset (chat media) by storage key' })
  async serveSecure(
    @Res() res: Response,
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('file') file: string,
  ): Promise<void> {
    await this.stream(
      res,
      this.media.serveSecure(`secure/${year}/${month}/${file}`),
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
