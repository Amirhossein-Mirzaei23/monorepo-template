import { ApiProperty } from '@nestjs/swagger';

/**
 * MEDIA-003 upload response. `video` is always present (the original mp4/webm
 * bytes, streamed by GET /media/:key); `poster`/`posterThumb` appear only when
 * a poster image was uploaded — posterThumb is the sharp 480w WebP variant,
 * poster the original bytes. All URLs are absolute (PUBLIC_MEDIA_BASE_URL).
 * Clients rendering a video WITHOUT a poster fall back to a generic icon
 * (viewer-side concern — MEDIA-004 owns that UI).
 */
export class MediaVideoUploadUrlsDto {
  @ApiProperty({ example: 'http://localhost:3001/media/2026/09/abc…123.mp4' })
  video!: string;

  @ApiProperty({
    required: false,
    example: 'http://localhost:3001/media/2026/09/abc…123p.jpg',
    description: 'Present only when a poster image was uploaded (original bytes)',
  })
  poster?: string;

  @ApiProperty({
    required: false,
    example: 'http://localhost:3001/media/2026/09/abc…123pt.webp',
    description: 'Present only when a poster image was uploaded (480w WebP q80 variant)',
  })
  posterThumb?: string;
}

export class MediaVideoUploadResponseDto {
  @ApiProperty({ example: 'clx…cuid', description: 'MediaAsset id (type VIDEO)' })
  id!: string;

  @ApiProperty({ type: MediaVideoUploadUrlsDto })
  urls!: MediaVideoUploadUrlsDto;

  @ApiProperty({
    example: 58_000,
    description:
      'Validated duration in ms — server-parsed from the mp4 mvhd box when available, ' +
      'otherwise the client-reported durationMs (WebM / unparseable mp4)',
  })
  durationMs!: number;
}
