/**
 * MEDIA-004 — client video poster capture (decision D10: no server ffmpeg).
 * Picks a representative frame from the picked video File by seeking a
 * <video> element (~1s, or 10% of the duration for short clips), drawing it to
 * a canvas and encoding JPEG q0.8 — returned alongside the measured
 * `durationMs` (POST /media/video needs it; the server re-parses mp4 itself
 * and only trusts the client for WebM).
 *
 * Resilience: a seek that never lands (rare WebM metadata gaps) falls back to
 * the first frame; metadata/seek failures and an unloadable video reject and
 * the caller decides (uploader lets the upload proceed poster-less — the API
 * falls back to a generic icon).
 *
 * Testability: jsdom has no video pipeline, so every DOM touchpoint is
 * injectable via {@link CapturePosterDeps} — tests drive a fake video element
 * by dispatching loadedmetadata/seeked events.
 */

import { COMPRESSION_QUALITY } from './compress';

/** Raised when the video cannot be opened/read at all. */
export class PosterCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PosterCaptureError';
  }
}

export interface CapturedPoster {
  /** JPEG q0.8 frame as a File, ready for the `poster` multipart field. */
  poster: File;
  /** Measured duration in ms — 0 when the browser reports none (unknown). */
  durationMs: number;
}

export interface CapturePosterOptions {
  /** Fixed seek target in seconds — default min(1s, 10% of duration). */
  seekSeconds?: number;
  quality?: number;
  /** Per-wait (metadata / seek) timeout in ms. */
  timeoutMs?: number;
  deps?: Partial<CapturePosterDeps>;
}

interface CapturePosterDeps {
  createVideo: () => HTMLVideoElement;
  createCanvas: () => HTMLCanvasElement;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
}

function defaultDeps(): CapturePosterDeps {
  return {
    createVideo: () => document.createElement('video'),
    createCanvas: () => document.createElement('canvas'),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  };
}

/** Resolves on `event`, rejects on video error or the timeout. */
function waitFor(target: EventTarget, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new PosterCaptureError(`منتظر «${event}» ماند`));
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new PosterCaptureError('ویدیو خوانده نشد'));
    };
    function cleanup(): void {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
    }
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

/** Seek tolerance: a stuck seek falls back to whatever frame is current. */
async function seekTo(video: HTMLVideoElement, seconds: number, timeoutMs: number): Promise<void> {
  if (Math.abs(video.currentTime - seconds) < 0.01) {
    return;
  }
  video.currentTime = seconds;
  await waitFor(video, 'seeked', timeoutMs).catch(() => undefined);
}

/**
 * Captures a poster frame from a video File. Pure with respect to the caller;
 * the object URL it creates is always revoked.
 */
export async function captureVideoPoster(
  file: File,
  options: CapturePosterOptions = {},
): Promise<CapturedPoster> {
  const {
    seekSeconds,
    quality = COMPRESSION_QUALITY,
    timeoutMs = 8_000,
    deps: depsOverride,
  } = options;
  const deps = { ...defaultDeps(), ...depsOverride };
  const video = deps.createVideo();
  const objectUrl = deps.createObjectUrl(file);
  try {
    video.muted = true;
    video.preload = 'auto';
    video.src = objectUrl;
    await waitFor(video, 'loadedmetadata', timeoutMs);

    const rawDuration = video.duration;
    const durationMs =
      Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration * 1000) : 0;

    const target = seekSeconds ?? (durationMs > 0 ? Math.min(1, (durationMs / 1000) * 0.1) : 1);
    await seekTo(video, target, timeoutMs);

    if (video.videoWidth <= 0 || video.videoHeight <= 0) {
      throw new PosterCaptureError('فریمی از ویدیو خوانده نشد');
    }

    const canvas = deps.createCanvas();
    const context = canvas.getContext('2d');
    if (!context) {
      throw new PosterCaptureError('امکان گرفتن تصویر در این مرورگر نیست');
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new PosterCaptureError('ساخت تصویر ناموفق بود')),
        'image/jpeg',
        quality,
      );
    });

    return {
      poster: new File([blob], `${file.name || 'video'}-poster.jpg`, { type: 'image/jpeg' }),
      durationMs,
    };
  } finally {
    video.removeAttribute('src');
    deps.revokeObjectUrl(objectUrl);
  }
}
