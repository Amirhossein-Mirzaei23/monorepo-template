import { act, renderHook } from '@testing-library/react';
import { ApiError } from '@/lib/api-client';
import { publicApiUrl } from '@/lib/config';
import type { MediaImageUploadResponse, MediaVideoUploadResponse } from '../types';
import { uploadImage, uploadVideo, useMediaUpload } from '../hooks/use-upload';

/**
 * MEDIA-004 upload tests against a mocked XMLHttpRequest (jsdom's real XHR
 * cannot talk to a server): assert the exact request shape (URL, bearer
 * header, multipart fields), progress percent emission, error normalization
 * into ApiError, the hook's token binding and abort-on-unmount.
 */

type ProgressEventStub = { lengthComputable: boolean; loaded: number; total: number };
type Listener = (event?: unknown) => void;

/** Scriptable XHR double: records the request, replays progress/load/error. */
class FakeXhr {
  static instances: FakeXhr[] = [];

  readonly upload = {
    addEventListener: (type: string, listener: (event: ProgressEventStub) => void) => {
      if (type === 'progress') {
        this.progressListener = listener;
      }
    },
  };

  method = '';
  url = '';
  status = 0;
  responseText = '';
  aborted = false;
  sentBody: FormData | undefined;
  readonly headers = new Map<string, string>();
  private readonly listeners = new Map<string, Listener[]>();
  private progressListener?: (event: ProgressEventStub) => void;

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(body: Document | XMLHttpRequestBodyInit | null): void {
    FakeXhr.instances.push(this);
    this.sentBody = body as FormData;
  }

  // ——— test drivers ———
  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  progress(loaded: number, total: number): void {
    this.progressListener?.({ lengthComputable: true, loaded, total });
  }

  respondWith(status: number, responseText: string): void {
    this.status = status;
    this.responseText = responseText;
    this.emit('load');
  }

  abort(): void {
    this.aborted = true;
    this.emit('abort');
  }
}

const imageResponse: MediaImageUploadResponse = {
  id: 'asset-1',
  urls: {
    original: 'https://media.test/o.jpg',
    cover: 'https://media.test/c.webp',
    thumb: 'https://media.test/t.webp',
  },
  width: 100,
  height: 100,
};

const videoResponse: MediaVideoUploadResponse = {
  id: 'asset-v1',
  urls: {
    video: 'https://media.test/v.mp4',
    poster: 'https://media.test/p.jpg',
    posterThumb: 'https://media.test/pt.webp',
  },
  durationMs: 5000,
};

function lastXhr(): FakeXhr {
  const xhr = FakeXhr.instances.at(-1);
  if (!xhr) {
    throw new Error('no XHR was sent');
  }
  return xhr;
}

function makeFile(name: string, type: string): File {
  return new File([new ArrayBuffer(8)], name, { type });
}

let accessToken: string | undefined = 'test-token';

// NOTE: relative path — next/jest rewrites `@/` imports at transform time but
// jest.mock's string argument is resolved literally, so the alias fails here.
jest.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({ accessToken: () => accessToken }),
}));

beforeEach(() => {
  FakeXhr.instances = [];
  accessToken = 'test-token';
  window.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
});

describe('uploadImage (plain function)', () => {
  it('POSTs the file to {api}/media with the bearer header', async () => {
    const file = makeFile('photo.jpg', 'image/jpeg');
    const promise = uploadImage({ file, token: 'tok-1', apiUrl: 'https://api.test' });

    const xhr = lastXhr();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('https://api.test/media');
    expect(xhr.headers.get('Authorization')).toBe('Bearer tok-1');
    expect(xhr.sentBody).toBeInstanceOf(FormData);
    // jsdom wraps stored Files — same content, different identity.
    expect(xhr.sentBody?.get('file')).toStrictEqual(file);

    xhr.respondWith(200, JSON.stringify(imageResponse));
    await expect(promise).resolves.toEqual(imageResponse);
  });

  it('emits upload progress as percentages', async () => {
    const onProgress = jest.fn();
    const promise = uploadImage({
      file: makeFile('photo.jpg', 'image/jpeg'),
      token: 't',
      apiUrl: 'https://api.test',
      onProgress,
    });

    const xhr = lastXhr();
    xhr.progress(25, 100);
    xhr.progress(75, 100);
    xhr.respondWith(200, JSON.stringify(imageResponse));

    await promise;
    expect(onProgress).toHaveBeenNthCalledWith(1, 25);
    expect(onProgress).toHaveBeenNthCalledWith(2, 75);
  });

  it('normalizes a 415 rejection into ApiError with the error body', async () => {
    const promise = uploadImage({
      file: makeFile('photo.tiff', 'image/tiff'),
      token: 't',
      apiUrl: 'https://api.test',
    });
    lastXhr().respondWith(
      415,
      JSON.stringify({
        statusCode: 415,
        error: 'Unsupported Media Type',
        message: 'unsupported media type',
        code: 'UNSUPPORTED_MEDIA_TYPE',
      }),
    );

    const error = (await promise.catch((value: unknown) => value)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(415);
    expect(error.body?.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('maps a network failure to ApiError status 0', async () => {
    const promise = uploadImage({
      file: makeFile('photo.jpg', 'image/jpeg'),
      token: 't',
      apiUrl: 'https://api.test',
    });
    lastXhr().emit('error');

    const error = (await promise.catch((value: unknown) => value)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
  });

  it('rejects when a 2xx response carries no JSON body', async () => {
    const promise = uploadImage({
      file: makeFile('photo.jpg', 'image/jpeg'),
      token: 't',
      apiUrl: 'https://api.test',
    });
    lastXhr().respondWith(200, 'not-json');

    const error = (await promise.catch((value: unknown) => value)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
  });
});

describe('uploadVideo (plain function)', () => {
  it('POSTs video + poster + durationMs to {api}/media/video', async () => {
    const file = makeFile('clip.mp4', 'video/mp4');
    const poster = makeFile('poster.jpg', 'image/jpeg');
    const promise = uploadVideo({
      file,
      poster,
      durationMs: 5000,
      token: 'tok-1',
      apiUrl: 'https://api.test',
    });

    const xhr = lastXhr();
    expect(xhr.url).toBe('https://api.test/media/video');
    expect(xhr.sentBody?.get('video')).toStrictEqual(file);
    expect(xhr.sentBody?.get('poster')).toStrictEqual(poster);
    expect(xhr.sentBody?.get('durationMs')).toBe('5000');

    xhr.respondWith(200, JSON.stringify(videoResponse));
    await expect(promise).resolves.toEqual(videoResponse);
  });

  it('omits optional fields when no poster/duration is available', async () => {
    const promise = uploadVideo({
      file: makeFile('clip.webm', 'video/webm'),
      token: 't',
      apiUrl: 'https://api.test',
    });

    const xhr = lastXhr();
    expect(xhr.sentBody?.has('poster')).toBe(false);
    expect(xhr.sentBody?.has('durationMs')).toBe(false);
    xhr.respondWith(200, JSON.stringify(videoResponse));
    await promise;
  });
});

describe('useMediaUpload', () => {
  it('binds the in-memory access token and the public API URL (bypasses the BFF)', async () => {
    const { result } = renderHook(() => useMediaUpload());
    let promise: Promise<MediaImageUploadResponse> | undefined;
    act(() => {
      promise = result.current.uploadImage(makeFile('photo.jpg', 'image/jpeg'));
    });

    const xhr = lastXhr();
    expect(xhr.url).toBe(`${publicApiUrl}/media`);
    expect(xhr.headers.get('Authorization')).toBe('Bearer test-token');
    xhr.respondWith(200, JSON.stringify(imageResponse));
    await act(async () => {
      await promise;
    });
  });

  it('aborts in-flight uploads on unmount', async () => {
    const { result, unmount } = renderHook(() => useMediaUpload());
    let promise: Promise<MediaImageUploadResponse> | undefined;
    act(() => {
      promise = result.current.uploadImage(makeFile('photo.jpg', 'image/jpeg'));
    });

    const xhr = lastXhr();
    unmount();
    expect(xhr.aborted).toBe(true);
    await expect(promise).rejects.toMatchObject({ status: 0 });
  });

  it('rejects 401 when no access token is available', async () => {
    accessToken = undefined;
    const { result } = renderHook(() => useMediaUpload());
    let rejection: unknown;
    await act(async () => {
      rejection = await result.current
        .uploadImage(makeFile('photo.jpg', 'image/jpeg'))
        .catch((value: unknown) => value);
    });

    expect(rejection).toBeInstanceOf(ApiError);
    expect((rejection as ApiError).status).toBe(401);
    expect(FakeXhr.instances).toHaveLength(0);
  });
});
