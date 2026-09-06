import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaType, type LotMedia, type MediaAsset } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * `PUT /lots/:id/media` body + media response shapes (MEDIA-005).
 *
 * Deliberate contract decisions, documented:
 * - PUT (full replace) semantics: `items` is the COMPLETE ordered gallery —
 *   links missing from the payload are deleted, kept links are updated in
 *   place (row id/createdAt preserved), new ones created. An empty array
 *   clears the gallery.
 * - Items carry ONLY `mediaAssetId`. The IMAGE/VIDEO kind is DERIVED from the
 *   MediaAsset row (a client-declared kind would be a forgery vector); the
 *   global whitelist pipe rejects any extra key with 400.
 * - The cover is picked by `coverIndex` (default 0) — exactly one cover per
 *   lot is a server invariant, clients never send per-item isCover flags
 *   (which could say 0 or 2 covers).
 * - Caps are per KIND from the asset rows: ≤ uploads.maxLotImages (15)
 *   images and ≤ uploads.maxLotVideos (3) videos — enforced in LotsService
 *   (the DTO cannot know asset kinds); exceedance → 409 with the counts.
 */

/** One gallery entry — ordered by array position. */
export class PutLotMediaItemDto {
  @ApiProperty({
    example: 'clx…cuid',
    description: 'MediaAsset id from POST /media — must EXIST and belong to the caller',
  })
  @IsString()
  mediaAssetId!: string;
}

/** Coarse payload bound (DTO layer): 15 images + 3 videos is the max gallery. */
export const LOT_MEDIA_MAX_ITEMS = 18;

export class PutLotMediaDto {
  @ApiProperty({
    type: [PutLotMediaItemDto],
    description:
      'The complete ordered gallery — items missing from the payload are unlinked; [] clears all media',
    maxItems: LOT_MEDIA_MAX_ITEMS,
  })
  @IsArray()
  @ArrayMaxSize(LOT_MEDIA_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => PutLotMediaItemDto)
  items!: PutLotMediaItemDto[];

  @ApiPropertyOptional({
    example: 0,
    minimum: 0,
    default: 0,
    type: Number,
    description:
      'Array position of the cover item (default 0); must be within bounds — else 400. Exactly one cover is a server invariant',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  coverIndex?: number;
}

/** One gallery entry as served in lot payloads (MEDIA-005) — ordered by sortOrder. */
export class LotMediaResponseDto {
  @ApiProperty({ example: 'clx…cuid', description: 'LotMedia (link) id — NOT the asset id' })
  id!: string;

  @ApiProperty({ example: 'clx…cuid', description: 'MediaAsset id' })
  mediaAssetId!: string;

  @ApiProperty({ enum: MediaType, example: 'IMAGE', description: 'Derived from the asset row' })
  kind!: MediaType;

  @ApiProperty({
    example: 'http://localhost:3001/media/2026/09/abc…123.jpg',
    description: 'Original bytes — absolute PUBLIC_MEDIA_BASE_URL + storageKey',
  })
  url!: string;

  @ApiPropertyOptional({
    example: 'http://localhost:3001/media/2026/09/abc…123t.webp',
    nullable: true,
    type: String,
    description:
      'IMAGE: the 480w WebP thumb (when the variant pipeline ran); VIDEO: the client poster thumb (thumbKey) or null',
  })
  thumbUrl!: string | null;

  @ApiProperty({ example: 0, description: '0-based display position (list is sorted by this)' })
  sortOrder!: number;

  @ApiProperty({ example: true, description: 'Exactly one entry per lot is the cover' })
  isCover!: boolean;
}

/** A LotMedia row with its asset — the include shape LotsRepository returns. */
export type LotMediaWithAsset = LotMedia & { mediaAsset: MediaAsset };

/**
 * Allowlist mapper for gallery entries. `baseUrl` is the PUBLIC_MEDIA_BASE_URL
 * the service resolves from config — the mapper stays pure (no ConfigService),
 * so unit tests pin the URL shape with a fixed base.
 */
export function toLotMediaResponse(
  rows: readonly LotMediaWithAsset[],
  baseUrl: string,
): LotMediaResponseDto[] {
  const base = baseUrl.replace(/\/+$/, '');
  return rows.map((row) => ({
    id: row.id,
    mediaAssetId: row.mediaAssetId,
    kind: row.mediaAsset.type,
    url: `${base}/${row.mediaAsset.storageKey}`,
    // Images: sharp thumb variant; videos: thumbKey IS the client poster thumb
    // (MEDIA-003) — absent when no poster was uploaded → null (generic icon).
    thumbUrl: row.mediaAsset.thumbKey ? `${base}/${row.mediaAsset.thumbKey}` : null,
    sortOrder: row.sortOrder,
    isCover: row.isCover,
  }));
}
