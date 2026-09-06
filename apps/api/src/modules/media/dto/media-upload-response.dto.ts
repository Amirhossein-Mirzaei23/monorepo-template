import { ApiProperty } from '@nestjs/swagger';

/**
 * MEDIA-002 upload response. The three URLs are absolute (PUBLIC_MEDIA_BASE_URL
 * + key) so clients can hand them straight to <img>/fetch — the public GET
 * /media/:key route streams them. `width`/`height` describe the ORIGINAL.
 */
export class MediaUploadUrlsDto {
  @ApiProperty({ example: 'http://localhost:3001/media/2026/09/abc…123.jpg' })
  original!: string;

  @ApiProperty({
    example: 'http://localhost:3001/media/2026/09/abc…123c.webp',
    description: 'WebP q80 variant, width ≤ 1200 (no upscale)',
  })
  cover!: string;

  @ApiProperty({
    example: 'http://localhost:3001/media/2026/09/abc…123t.webp',
    description: 'WebP q80 variant, width ≤ 480 (no upscale)',
  })
  thumb!: string;
}

export class MediaUploadResponseDto {
  @ApiProperty({ example: 'clx…cuid', description: 'MediaAsset id' })
  id!: string;

  @ApiProperty({ type: MediaUploadUrlsDto })
  urls!: MediaUploadUrlsDto;

  @ApiProperty({ example: 4032, description: 'Original pixel width (sharp metadata)' })
  width!: number;

  @ApiProperty({ example: 3024, description: 'Original pixel height (sharp metadata)' })
  height!: number;
}
