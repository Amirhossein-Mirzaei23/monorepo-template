import sharp from 'sharp';
import { MEDIA_VARIANT_WIDTHS } from '../media.constants';
import { ImageVariantService } from '../images/variant.service';

/** In-process generated fixtures — no binary files are committed (MEDIA-002). */
async function pngOf(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 40, b: 200 } },
  })
    .png()
    .toBuffer();
}

describe('ImageVariantService (MEDIA-002)', () => {
  let service: ImageVariantService;

  beforeAll(() => {
    service = new ImageVariantService();
  });

  describe('sniffMime (magic bytes)', () => {
    it('identifies real JPEG/PNG/WebP buffers', async () => {
      const jpeg = await sharp({
        create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .jpeg()
        .toBuffer();
      const webp = await sharp({
        create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .webp()
        .toBuffer();
      expect(service.sniffMime(jpeg)).toBe('image/jpeg');
      expect(service.sniffMime(await pngOf(8, 8))).toBe('image/png');
      expect(service.sniffMime(webp)).toBe('image/webp');
    });

    it('recognizes the signatures in hand-rolled buffers', () => {
      const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
      const png = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const webp = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0x24, 0x00, 0x00, 0x00]),
        Buffer.from('WEBPVP8 '),
      ]);
      expect(service.sniffMime(jpeg)).toBe('image/jpeg');
      expect(service.sniffMime(png)).toBe('image/png');
      expect(service.sniffMime(webp)).toBe('image/webp');
    });

    it('returns null for garbage, empty buffers and prefix-extended lookalikes', () => {
      expect(service.sniffMime(Buffer.from('definitely not an image'))).toBeNull();
      expect(service.sniffMime(Buffer.alloc(0))).toBeNull();
      // A PNG signature followed by junk still SNIFFS as png — deep validation
      // is sharp's job (a decode failure becomes a 500 with cleanup upstream).
      const short = Buffer.from([0x89, 0x50]);
      expect(service.sniffMime(short)).toBeNull();
    });
  });

  describe('buildVariants (real sharp)', () => {
    it('scales a wide source to cover 1200w and thumb 480w preserving aspect ratio', async () => {
      const source = await pngOf(2000, 1000);
      const { cover, thumb, width, height } = await service.buildVariants(source);

      expect(width).toBe(2000);
      expect(height).toBe(1000);
      const coverMeta = await sharp(cover).metadata();
      const thumbMeta = await sharp(thumb).metadata();
      expect(coverMeta.format).toBe('webp');
      expect(thumbMeta.format).toBe('webp');
      expect(coverMeta.width).toBe(MEDIA_VARIANT_WIDTHS.cover);
      expect(coverMeta.height).toBe(600); // aspect 2:1 preserved
      expect(thumbMeta.width).toBe(MEDIA_VARIANT_WIDTHS.thumb);
      expect(thumbMeta.height).toBe(240);
    });

    it('NEVER upscales: a 64x64 source keeps its size in both variants', async () => {
      const source = await pngOf(64, 64);
      const { cover, thumb, width, height } = await service.buildVariants(source);

      expect(width).toBe(64);
      expect(height).toBe(64);
      const coverMeta = await sharp(cover).metadata();
      const thumbMeta = await sharp(thumb).metadata();
      expect(coverMeta.width).toBe(64);
      expect(coverMeta.height).toBe(64);
      expect(thumbMeta.width).toBe(64);
      expect(thumbMeta.height).toBe(64);
    });

    it('downscales only the thumb when the source is narrower than the cover cap', async () => {
      const source = await pngOf(600, 400);
      const { cover, thumb } = await service.buildVariants(source);
      const coverMeta = await sharp(cover).metadata();
      const thumbMeta = await sharp(thumb).metadata();
      expect(coverMeta.width).toBe(600); // ≤ 1200 → untouched dimensions
      expect(coverMeta.height).toBe(400);
      expect(thumbMeta.width).toBe(480);
      expect(thumbMeta.height).toBe(320); // 400 × 480/600
    });

    it('preserves alpha through the WebP pipeline (no JPEG fallback needed)', async () => {
      const transparent = await sharp({
        create: {
          width: 40,
          height: 40,
          channels: 4,
          background: { r: 10, g: 20, b: 30, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer();
      const { cover } = await service.buildVariants(transparent);
      const coverMeta = await sharp(cover).metadata();
      expect(coverMeta.format).toBe('webp');
      expect(coverMeta.hasAlpha).toBe(true);
    });

    it('throws on undecodable bytes (mapped to 500 + cleanup by MediaService)', async () => {
      await expect(service.buildVariants(Buffer.from('png-magic-pretender-bytes'))).rejects.toThrow(
        /input|decode|premature|unsupported/i,
      );
    });
  });

  describe('buildThumb (MEDIA-003 poster thumb)', () => {
    it('encodes the same 480w WebP as buildVariants’ thumb — and never upscales', async () => {
      const wide = await pngOf(2000, 1000);
      const thumb = await service.buildThumb(wide);
      const meta = await sharp(thumb).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(MEDIA_VARIANT_WIDTHS.thumb);
      expect(meta.height).toBe(240); // 1000 × 480/2000 — aspect preserved

      // A small poster keeps its size (no upscale, same as buildVariants).
      const small = await service.buildThumb(await pngOf(64, 64));
      const smallMeta = await sharp(small).metadata();
      expect(smallMeta.format).toBe('webp');
      expect(smallMeta.width).toBe(64);
      expect(smallMeta.height).toBe(64);
    });

    it('throws on undecodable bytes (mapped to 500 + cleanup by VideoService)', async () => {
      await expect(service.buildThumb(Buffer.from('not-decodable-bytes'))).rejects.toThrow(
        /input|decode|premature|unsupported/i,
      );
    });
  });
});
