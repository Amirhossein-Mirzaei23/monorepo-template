import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { pipeline } from 'node:stream';
import { Public } from '../../common/decorators/public.decorator';
import type { MediaContent } from './media.service';
import { MediaService } from './media.service';

/**
 * Media serving (MEDIA-001). Storage keys are `{yyyy}/{mm}/{id}.{ext}`, so a
 * key is always exactly three segments (plus the `secure/` prefix on the
 * bearer route) — the routes below bind one param per segment instead of a
 * slash-spanning wildcard, and MediaService re-validates the reassembled key
 * against the pattern/traversal guard (400) before anything touches the
 * driver. Content-type always comes from the stored MediaAsset row.
 *
 * GET /media/:year/:month/:file        — @Public, immutable cache headers
 *   (keys are unguessable and content is immutable; only lot variants/avatars
 *   mint public keys). GET /media/secure/... — JWT (global guard, no @Public),
 *   `private, no-store`: authenticated chat media must not sit in shared
 *   caches. Per-message authorization arrives with chat (CHT); the unguessable
 *   random key is the guard on this card.
 */
@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

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
   * (MediaContent.mime/sizeBytes — never the request). pipeline() forwards
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
    res.setHeader('Content-Length', String(sizeBytes));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', cacheControl);
    pipeline(stream, res, () => {
      // Errors after the headers are sent can only destroy the response —
      // the GlobalExceptionFilter can no longer help; nothing to log per-card.
    });
  }
}
