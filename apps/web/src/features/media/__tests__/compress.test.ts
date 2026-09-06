import { CompressionError, COMPRESSION_MAX_EDGE_PX, compressImage } from '../lib/compress';

/**
 * MEDIA-004 compress unit tests. jsdom has no real canvas/bitmap decoder, so
 * the DOM touchpoints are injected (`decode`/`createCanvas`) and the pure
 * pipeline is asserted: measure → scale → draw (white-flattened) → encode →
 * smaller-of-the-two wins.
 */

interface StubContext {
  fillStyle: string;
  fillRect: jest.Mock;
  drawImage: jest.Mock;
}

interface StubCanvas {
  canvas: HTMLCanvasElement;
  context: StubContext;
  toBlob: jest.Mock;
}

/** Creates a canvas stub whose toBlob yields a fake JPEG of `blobSize` bytes. */
function createStubCanvas(blobSize: number): StubCanvas {
  const context: StubContext = {
    fillStyle: '',
    fillRect: jest.fn(),
    drawImage: jest.fn(),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback: (blob: Blob | null) => void, type: string, quality: number) => {
      expect(type).toBe('image/jpeg');
      expect(quality).toBeCloseTo(0.8);
      callback(new Blob([new ArrayBuffer(blobSize)], { type: 'image/jpeg' }));
    },
  };
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    context,
    toBlob: canvas.toBlob as unknown as jest.Mock,
  };
}

function makeFile(size: number, name = 'photo.png', type = 'image/png'): File {
  return new File([new ArrayBuffer(size)], name, { type });
}

describe('compressImage', () => {
  it('downscales a 4000×3000 photo to the 2000px longest edge and returns the JPEG', async () => {
    const close = jest.fn();
    const decode = jest.fn().mockResolvedValue({ width: 4000, height: 3000, close });
    const { canvas, context } = createStubCanvas(500);
    const file = makeFile(10_000);

    const result = await compressImage(file, {
      deps: { decode, createCanvas: () => canvas },
    });

    expect(canvas.width).toBe(COMPRESSION_MAX_EDGE_PX);
    expect(canvas.height).toBe(1500);
    expect(context.fillStyle).toBe('#ffffff'); // alpha flattened onto white
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 2000, 1500);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2000, 1500);
    expect(close).toHaveBeenCalled(); // bitmap resources released
    expect(result).not.toBe(file);
    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('photo.jpg');
    expect(result.size).toBe(500);
  });

  it('keeps dimensions when the image is already within the limit (no upscale)', async () => {
    const decode = jest.fn().mockResolvedValue({ width: 1000, height: 800 });
    const { canvas, context } = createStubCanvas(400);
    const file = makeFile(2000, 'small.jpg', 'image/jpeg');

    const result = await compressImage(file, { deps: { decode, createCanvas: () => canvas } });

    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(800);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1000, 800);
    expect(result.name).toBe('small.jpg');
  });

  it('measures via naturalWidth/naturalHeight for HTMLImageElement sources', async () => {
    const decode = jest.fn().mockResolvedValue({ naturalWidth: 400, naturalHeight: 200 });
    const { canvas } = createStubCanvas(100);

    await compressImage(makeFile(500), { deps: { decode, createCanvas: () => canvas } });

    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(200);
  });

  it('sends the ORIGINAL file when the re-encoded result would be larger', async () => {
    const decode = jest.fn().mockResolvedValue({ width: 800, height: 600 });
    const { canvas } = createStubCanvas(5000); // fake JPEG bigger than the source
    const file = makeFile(1000, 'tiny.png');

    const result = await compressImage(file, { deps: { decode, createCanvas: () => canvas } });

    expect(result).toBe(file); // smaller wins — original passes through untouched
  });

  it('rejects with CompressionError when the image cannot be decoded', async () => {
    const decode = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(
      compressImage(makeFile(100), {
        deps: { decode, createCanvas: () => createStubCanvas(1).canvas },
      }),
    ).rejects.toBeInstanceOf(CompressionError);
  });

  it('rejects when the decoded dimensions are unreadable', async () => {
    const decode = jest.fn().mockResolvedValue({ width: 0, height: 0 });

    await expect(
      compressImage(makeFile(100), {
        deps: { decode, createCanvas: () => createStubCanvas(1).canvas },
      }),
    ).rejects.toThrow('ابعاد تصویر خوانده نشد');
  });
});
