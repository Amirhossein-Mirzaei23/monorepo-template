import { PosterCaptureError, captureVideoPoster } from '../lib/poster-capture';

/**
 * MEDIA-004 poster-capture unit tests. jsdom has no video pipeline, so a fake
 * <video> element drives the flow: the test dispatches `loadedmetadata`, the
 * fake's currentTime setter dispatches `seeked`, and the canvas seam encodes a
 * stub JPEG. Asserts the seek target (~1s / 10%), durationMs measurement,
 * poster file shape, object-URL cleanup and the failure paths.
 */

/** Minimal HTMLVideoElement stand-in with evented currentTime/duration. */
class FakeVideo {
  private readonly target = new EventTarget();
  private readonly listeners = new Map<string, Set<EventListener>>();
  private currentTimeValue = 0;

  src = '';
  muted = false;
  preload = '';
  duration = 8;
  videoWidth = 640;
  videoHeight = 360;
  /** Set when removeAttribute('src') ran — the function's cleanup step. */
  removedSrc = false;

  get currentTime(): number {
    return this.currentTimeValue;
  }

  set currentTime(value: number) {
    this.currentTimeValue = value;
    // Real browsers fire `seeked` asynchronously after the seek completes.
    queueMicrotask(() => this.dispatch('seeked'));
  }

  addEventListener(type: string, listener: EventListener): void {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  removeAttribute(name: string): void {
    if (name === 'src') {
      this.removedSrc = true;
      this.src = '';
    }
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type));
    }
  }
}

interface StubCanvas {
  canvas: HTMLCanvasElement;
  drawImage: jest.Mock;
}

function createStubCanvas(): StubCanvas {
  const drawImage = jest.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toBlob: (callback: (blob: Blob | null) => void) => {
      callback(new Blob([new ArrayBuffer(20)], { type: 'image/jpeg' }));
    },
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, drawImage };
}

function makeVideoFile(): File {
  return new File([new ArrayBuffer(100)], 'clip.mp4', { type: 'video/mp4' });
}

interface Harness {
  video: FakeVideo;
  drawImage: jest.Mock;
  revokeObjectUrl: jest.Mock;
  deps: {
    createVideo: () => HTMLVideoElement;
    createCanvas: () => HTMLCanvasElement;
    createObjectUrl: (blob: Blob) => string;
    revokeObjectUrl: (url: string) => void;
  };
}

function createHarness(): Harness {
  const video = new FakeVideo();
  const { canvas, drawImage } = createStubCanvas();
  const revokeObjectUrl = jest.fn();
  return {
    video,
    drawImage,
    revokeObjectUrl,
    deps: {
      createVideo: () => video as unknown as HTMLVideoElement,
      createCanvas: () => canvas,
      createObjectUrl: () => 'blob:clip',
      revokeObjectUrl,
    },
  };
}

describe('captureVideoPoster', () => {
  it('seeks to 10% of an 8s clip, captures a JPEG poster and reports durationMs', async () => {
    const harness = createHarness();
    const promise = captureVideoPoster(makeVideoFile(), { deps: harness.deps });
    await Promise.resolve();
    harness.video.dispatch('loadedmetadata'); // seeked fires via the setter microtask

    const { poster, durationMs } = await promise;

    expect(harness.video.removedSrc).toBe(true); // src cleaned up (was blob:clip)
    expect(harness.video.muted).toBe(true);
    expect(harness.video.currentTime).toBeCloseTo(0.8); // min(1s, 10% × 8s)
    expect(durationMs).toBe(8000);
    expect(poster.type).toBe('image/jpeg');
    expect(poster.name).toBe('clip.mp4-poster.jpg');
    expect(harness.drawImage).toHaveBeenCalledWith(
      harness.video as unknown as HTMLVideoElement,
      0,
      0,
      640,
      360,
    );
    expect(harness.revokeObjectUrl).toHaveBeenCalledWith('blob:clip');
  });

  it('seeks to ~1s for long clips and honours an explicit seekSeconds override', async () => {
    const harness = createHarness();
    harness.video.duration = 120;
    const promise = captureVideoPoster(makeVideoFile(), {
      seekSeconds: 2,
      deps: harness.deps,
    });
    await Promise.resolve();
    harness.video.dispatch('loadedmetadata');

    await promise;

    expect(harness.video.currentTime).toBe(2);
  });

  it('reports durationMs 0 and falls back to the 1s seek when duration is unknown (WebM)', async () => {
    const harness = createHarness();
    harness.video.duration = Number.NaN;
    const promise = captureVideoPoster(makeVideoFile(), { deps: harness.deps });
    await Promise.resolve();
    harness.video.dispatch('loadedmetadata');

    const { durationMs } = await promise;

    expect(harness.video.currentTime).toBe(1);
    expect(durationMs).toBe(0);
  });

  it('rejects when the video element errors while loading', async () => {
    const harness = createHarness();
    const promise = captureVideoPoster(makeVideoFile(), { deps: harness.deps });
    await Promise.resolve();
    harness.video.dispatch('error');

    await expect(promise).rejects.toBeInstanceOf(PosterCaptureError);
    expect(harness.revokeObjectUrl).toHaveBeenCalledWith('blob:clip'); // cleanup still runs
  });

  it('times out when loadedmetadata never arrives', async () => {
    const harness = createHarness();
    const promise = captureVideoPoster(makeVideoFile(), { timeoutMs: 10, deps: harness.deps });

    await expect(promise).rejects.toBeInstanceOf(PosterCaptureError);
    expect(harness.revokeObjectUrl).toHaveBeenCalledWith('blob:clip');
  });

  it('rejects when the video has no readable frame dimensions', async () => {
    const harness = createHarness();
    harness.video.videoWidth = 0;
    const promise = captureVideoPoster(makeVideoFile(), { deps: harness.deps });
    await Promise.resolve();
    harness.video.dispatch('loadedmetadata');

    await expect(promise).rejects.toThrow('فریمی از ویدیو خوانده نشد');
  });
});
