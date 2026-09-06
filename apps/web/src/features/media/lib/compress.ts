/**
 * MEDIA-004 — client-side image compression before upload.
 *
 * Decisions (documented per the card, kept deliberately simple):
 * - Images whose longest edge exceeds {@link COMPRESSION_MAX_EDGE_PX} are downscaled
 *   to it (aspect preserved, never upscaled); smaller images keep their size.
 * - EVERY image is re-encoded as JPEG q{@link COMPRESSION_QUALITY} (JPEG has no
 *   alpha, so transparency is flattened onto white before drawing).
 * - If the re-encoded result would be LARGER than the original file, the original
 *   is sent instead — the smaller of the two always wins.
 *
 * Testability: jsdom has no real canvas/bitmap decoder, so every DOM touchpoint
 * is injectable via {@link CompressDeps} — unit tests stub `decode`/`createCanvas`
 * and the pure pipeline (measure → scale → draw → encode → pick smaller) runs as-is.
 */

/** Longest-edge cap before upload (card: canvas downscale to max 2000px). */
export const COMPRESSION_MAX_EDGE_PX = 2000;

/** JPEG encode quality (card: q0.8 — same as the API's sharp variant quality). */
export const COMPRESSION_QUALITY = 0.8;

/** Raised when the browser cannot decode the image or encode the JPEG. */
export class CompressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompressionError';
  }
}

export interface CompressOptions {
  maxEdgePx?: number;
  quality?: number;
  /** Injectable DOM seams — tests stub these; production uses the defaults. */
  deps?: Partial<CompressDeps>;
}

interface CompressDeps {
  decode: (file: Blob) => Promise<ImageBitmap | HTMLImageElement>;
  createCanvas: () => HTMLCanvasElement;
}

type DecodedSource = ImageBitmap | HTMLImageElement;

function defaultDecode(file: Blob): Promise<DecodedSource> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  // Legacy fallback: <img> + object URL.
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new CompressionError('تصویر رمزگشایی نشد'));
    };
    image.src = url;
  });
}

/** ImageBitmap exposes width/height; HTMLImageElement naturalWidth/Height. */
function sourceSize(source: DecodedSource): { width: number; height: number } {
  if ('naturalWidth' in source) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new CompressionError('فشرده‌سازی تصویر ناموفق بود'));
        }
      },
      'image/jpeg',
      quality,
    );
  });
}

function toJpegFile(blob: Blob, originalName: string): File {
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return new File([blob], `${base || 'image'}.jpg`, { type: 'image/jpeg' });
}

/**
 * Compresses an image File for upload: downscale to ≤ maxEdgePx on the longest
 * edge, re-encode JPEG q0.8 (white-flattened), return whichever of the
 * compressed/original file is smaller. Pure with respect to the caller — the
 * input File is never mutated.
 */
export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
  const { maxEdgePx = COMPRESSION_MAX_EDGE_PX, quality = COMPRESSION_QUALITY, deps } = options;
  const decode = deps?.decode ?? defaultDecode;
  const createCanvas = deps?.createCanvas ?? (() => document.createElement('canvas'));

  let source: DecodedSource;
  try {
    source = await decode(file);
  } catch (error) {
    if (error instanceof CompressionError) {
      throw error;
    }
    throw new CompressionError('تصویر رمزگشایی نشد');
  }

  const { width, height } = sourceSize(source);
  if (width <= 0 || height <= 0) {
    throw new CompressionError('ابعاد تصویر خوانده نشد');
  }

  // Downscale only — never upscale (matches the API's sharp variant behaviour).
  const scale = Math.min(1, maxEdgePx / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = createCanvas();
  const context = canvas.getContext('2d');
  if (!context) {
    throw new CompressionError('امکان پردازش تصویر در این مرورگر نیست');
  }
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  // JPEG has no alpha: flatten transparency onto white instead of black holes.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(source as CanvasImageSource, 0, 0, targetWidth, targetHeight);
  if ('close' in source && typeof source.close === 'function') {
    source.close();
  }

  const blob = await canvasToBlob(canvas, quality);
  // Smaller wins: a tiny/already-optimized source can beat the re-encode.
  if (blob.size >= file.size) {
    return file;
  }
  return toJpegFile(blob, file.name);
}
