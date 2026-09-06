import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { MEDIA_VARIANT_WIDTHS, MEDIA_VARIANT_WEBP_QUALITY } from '../media.constants';

/**
 * Image mimes this pipeline accepts (MEDIA-002) — the declared multipart mime
 * must be one of these AND the leading magic bytes must agree (sniffMime).
 */
export type SniffedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/** sharp metadata needed for the MediaAsset row + the upload response. */
export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageVariants extends ImageDimensions {
  /** WebP q80, width ≤ MEDIA_VARIANT_WIDTHS.cover (no upscale). */
  cover: Buffer;
  /** WebP q80, width ≤ MEDIA_VARIANT_WIDTHS.thumb (no upscale). */
  thumb: Buffer;
}

/**
 * MEDIA-002 image pipeline: magic-byte sniffing + sharp variant generation.
 * Deliberately a separate provider so the unit suite runs real sharp on
 * generated fixtures while MediaService can be tested with a stubbed pipeline
 * (cleanup-on-failure paths).
 *
 * Variant decisions (card says "WebP q80 + JPEG fallback for cover"):
 * - Both variants are WebP q80 (cover ≤1200w, thumb ≤480w), aspect preserved,
 *   NEVER upscaled (`withoutEnlargement`). The "JPEG fallback" branch of the
 *   card is dropped on purpose: WebP supports alpha, so the fallback-for-alpha
 *   motivation doesn't apply, and a second encoding format would need a second
 *   content-type/extension path end to end for no measured benefit. If WebP
 *   encoding itself fails, the upload fails closed with 500 + storage cleanup
 *   (MediaService) — that IS the fallback path.
 * - Original bytes are stored AS RECEIVED by MediaService; this service never
 *   re-encodes the original.
 */
@Injectable()
export class ImageVariantService {
  /**
   * Leading magic bytes → actual container. Returns null for anything that is
   * not one of the three allowed formats (declared mime is checked SEPARATELY
   * by MediaService — a mismatch is the "forged extension" 415).
   */
  sniffMime(buffer: Buffer): SniffedImageMime | null {
    // JPEG: FF D8 FF (start of image marker).
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A (8-byte signature).
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return 'image/png';
    }
    // WebP: RIFF....WEBP (bytes 0-3 + 8-11; length field sits between).
    if (
      buffer.length >= 12 &&
      buffer.toString('latin1', 0, 4) === 'RIFF' &&
      buffer.toString('latin1', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }
    return null;
  }

  /**
   * Generates cover + thumb WebP variants and reads the source dimensions.
   * Throws when sharp cannot decode the bytes (MediaService maps every throw
   * to 500 + best-effort cleanup of anything already stored).
   */
  async buildVariants(source: Buffer): Promise<ImageVariants> {
    const metadata = await sharp(source).metadata();
    const { width, height } = metadata;
    if (width === undefined || height === undefined) {
      // Decodable header but no raster dimensions — treat as a decode failure.
      throw new Error('sharp metadata returned no image dimensions');
    }
    const [cover, thumb] = await Promise.all([
      this.encodeWebp(source, MEDIA_VARIANT_WIDTHS.cover),
      this.encodeWebp(source, MEDIA_VARIANT_WIDTHS.thumb),
    ]);
    return { cover, thumb, width, height };
  }

  /** Fit-within-width WebP encode: aspect preserved, smaller images untouched. */
  private encodeWebp(source: Buffer, maxWidth: number): Promise<Buffer> {
    return sharp(source)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality: MEDIA_VARIANT_WEBP_QUALITY })
      .toBuffer();
  }
}
