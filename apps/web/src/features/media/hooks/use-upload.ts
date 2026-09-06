'use client';

/**
 * MEDIA-004 — direct browser→API uploads (decision D3: the BFF stays JSON-only).
 * XHR instead of fetch because only XHR exposes upload progress events.
 * Transport mirrors `lib/api-client`: failures normalize into the shared
 * `ApiError` so callers never parse raw responses.
 */

import { useCallback, useEffect, useRef } from 'react';
import { ApiError } from '@/lib/api-client';
import type { ApiErrorBody } from '@monorepo/shared-types';
import { publicApiUrl } from '@/lib/config';
import { useAuth } from '@/providers/auth-provider';
import type { MediaImageUploadResponse, MediaVideoUploadResponse } from '../types';

export type UploadProgressListener = (percent: number) => void;

/** Registers an in-flight XHR so the owner (hook) can cancel it. */
export type XhrRegistration = (xhr: XMLHttpRequest) => void;

interface XhrUploadArgs {
  apiUrl: string;
  token: string;
  path: '/media' | '/media/video';
  form: FormData;
  onProgress?: UploadProgressListener;
  registerXhr?: XhrRegistration;
}

function toApiError(status: number, responseText: string): ApiError {
  let body: ApiErrorBody | undefined;
  try {
    body = JSON.parse(responseText) as ApiErrorBody;
  } catch {
    body = undefined;
  }
  const message = Array.isArray(body?.message) ? body.message.join('; ') : body?.message;
  return new ApiError(status, message ?? `Upload failed (${status})`, body);
}

/** Single multipart POST over XHR with percent progress; resolves with the parsed body. */
export function xhrUpload({
  apiUrl,
  token,
  path,
  form,
  onProgress,
  registerXhr,
}: XhrUploadArgs): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiUrl}${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });
    }
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as unknown);
        } catch {
          reject(new ApiError(500, 'Invalid upload response received from the API'));
        }
      } else {
        reject(toApiError(xhr.status, xhr.responseText));
      }
    });
    xhr.addEventListener('error', () => reject(new ApiError(0, 'Network request failed')));
    xhr.addEventListener('abort', () => reject(new ApiError(0, 'Upload aborted')));
    if (registerXhr) {
      registerXhr(xhr);
    }
    xhr.send(form);
  });
}

export interface UploadImageArgs {
  file: File;
  token: string;
  apiUrl?: string;
  onProgress?: UploadProgressListener;
  registerXhr?: XhrRegistration;
}

/** MEDIA-002: POST {api}/media — multipart field `file`. */
export async function uploadImage(args: UploadImageArgs): Promise<MediaImageUploadResponse> {
  const form = new FormData();
  form.append('file', args.file, args.file.name);
  return (await xhrUpload({
    apiUrl: args.apiUrl ?? publicApiUrl,
    token: args.token,
    path: '/media',
    form,
    onProgress: args.onProgress,
    registerXhr: args.registerXhr,
  })) as MediaImageUploadResponse;
}

export interface UploadVideoArgs {
  file: File;
  /** Client-captured poster frame (optional — API falls back to a generic icon). */
  poster?: File | null;
  /** Client-measured duration in ms (required by the API for WebM). */
  durationMs?: number;
  token: string;
  apiUrl?: string;
  onProgress?: UploadProgressListener;
  registerXhr?: XhrRegistration;
}

/** MEDIA-003: POST {api}/media/video — multipart fields `video` + `poster` + `durationMs`. */
export async function uploadVideo(args: UploadVideoArgs): Promise<MediaVideoUploadResponse> {
  const form = new FormData();
  form.append('video', args.file, args.file.name);
  if (args.poster) {
    form.append('poster', args.poster, args.poster.name);
  }
  if (args.durationMs !== undefined && args.durationMs > 0) {
    form.append('durationMs', String(Math.round(args.durationMs)));
  }
  return (await xhrUpload({
    apiUrl: args.apiUrl ?? publicApiUrl,
    token: args.token,
    path: '/media/video',
    form,
    onProgress: args.onProgress,
    registerXhr: args.registerXhr,
  })) as MediaVideoUploadResponse;
}

/**
 * Maps an upload failure to the tile's Persian message. Status codes follow the
 * MEDIA-002/003 error contract (415/413/422/429/500); the API's own messages are
 * English, so — like the login form — we present mapped Persian copy.
 */
export function describeUploadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return 'برقراری ارتباط با سرور ممکن نشد؛ اتصال اینترنت را بررسی کنید';
    }
    if (error.body?.code === 'QUOTA_EXCEEDED') {
      return 'سهمیه آپلود روزانه شما پر شده است؛ فردا دوباره تلاش کنید';
    }
    switch (error.status) {
      case 401:
      case 403:
        return 'برای آپلود باید وارد حساب خود شوید';
      case 413:
        return 'حجم فایل بیش از حد مجاز است';
      case 415:
        return 'فرمت فایل پشتیبانی نمی‌شود';
      case 422:
        return 'طول ویدیو بیش از ۶۰ ثانیه مجاز نیست';
      case 429:
        return 'تلاش‌های آپلود بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید';
      case 500:
      case 502:
      case 503:
        return 'خطای سرور در پردازش فایل؛ دوباره تلاش کنید';
      default:
        break;
    }
  }
  return 'آپلود ناموفق بود؛ دوباره تلاش کنید';
}

export interface UseMediaUploadResult {
  /** POST /media — resolves with {id, urls{original,cover,thumb}, width, height}. */
  uploadImage: (
    file: File,
    onProgress?: UploadProgressListener,
  ) => Promise<MediaImageUploadResponse>;
  /** POST /media/video — resolves with {id, urls{video,poster?,posterThumb?}, durationMs}. */
  uploadVideo: (
    args: { file: File; poster?: File | null; durationMs?: number },
    onProgress?: UploadProgressListener,
  ) => Promise<MediaVideoUploadResponse>;
  /** Aborts every in-flight upload started by this hook instance. */
  cancelAll: () => void;
}

/**
 * Thin wrapper binding the in-memory access token (AuthProvider) and the public
 * API URL (bypassing the BFF per D3) onto the plain upload functions, with
 * abort-on-unmount. Per-item progress/ready/error state stays in the
 * uploader's controlled `value` — this hook deliberately holds none.
 */
export function useMediaUpload(): UseMediaUploadResult {
  const { accessToken } = useAuth();
  const xhrsRef = useRef(new Set<XMLHttpRequest>());

  const registerXhr = useCallback((xhr: XMLHttpRequest) => {
    xhrsRef.current.add(xhr);
    xhr.addEventListener('loadend', () => xhrsRef.current.delete(xhr), { once: true });
  }, []);

  const cancelAll = useCallback(() => {
    for (const xhr of xhrsRef.current) {
      xhr.abort();
    }
    xhrsRef.current.clear();
  }, []);

  useEffect(() => cancelAll, [cancelAll]);

  const run = useCallback(
    async <T>(
      path: '/media' | '/media/video',
      buildForm: () => FormData,
      onProgress?: UploadProgressListener,
    ): Promise<T> => {
      const token = accessToken();
      if (!token) {
        throw new ApiError(401, 'Not authenticated');
      }
      return (await xhrUpload({
        apiUrl: publicApiUrl,
        token,
        path,
        form: buildForm(),
        onProgress,
        registerXhr,
      })) as T;
    },
    [accessToken, registerXhr],
  );

  const uploadImage = useCallback<UseMediaUploadResult['uploadImage']>(
    (file, onProgress) =>
      run<MediaImageUploadResponse>(
        '/media',
        () => {
          const form = new FormData();
          form.append('file', file, file.name);
          return form;
        },
        onProgress,
      ),
    [run],
  );

  const uploadVideo = useCallback<UseMediaUploadResult['uploadVideo']>(
    ({ file, poster, durationMs }, onProgress) =>
      run<MediaVideoUploadResponse>(
        '/media/video',
        () => {
          const form = new FormData();
          form.append('video', file, file.name);
          if (poster) {
            form.append('poster', poster, poster.name);
          }
          if (durationMs !== undefined && durationMs > 0) {
            form.append('durationMs', String(Math.round(durationMs)));
          }
          return form;
        },
        onProgress,
      ),
    [run],
  );

  return { uploadImage, uploadVideo, cancelAll };
}
