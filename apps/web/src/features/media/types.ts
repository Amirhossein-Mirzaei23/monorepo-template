import type { MediaUploadResponseDto, MediaVideoUploadResponseDto } from '@monorepo/shared-types';

/** MEDIA-002 `POST /media` response (re-exported for the feature's consumers). */
export type MediaImageUploadResponse = MediaUploadResponseDto;

/** MEDIA-003 `POST /media/video` response (re-exported for the feature's consumers). */
export type MediaVideoUploadResponse = MediaVideoUploadResponseDto;

/** What a tile holds: a still image or a video (with client-captured poster). */
export type MediaItemKind = 'image' | 'video';

/** Per-item lifecycle: uploading → ready | error (retryable). */
export type MediaItemStatus = 'ready' | 'uploading' | 'error';

/**
 * One grid tile, fully controlled by the caller (`MediaUploader` is a controlled
 * component — `value`/`onChange` like any form field). `key` is client-generated
 * and stable across retries; `id` (the MediaAsset id) exists once `ready`.
 * Files/objects URLs never live here — value stays JSON-serializable so parents
 * (lot wizard, chat draft, avatar) can keep it in form state.
 */
export interface MediaItem {
  /** Client-generated unique key (React key + per-item operations). */
  key: string;
  kind: MediaItemKind;
  /** MediaAsset id — present once the upload succeeded. */
  id?: string;
  /** Preview/source URL: media URL when ready, blob/object URL while uploading. */
  url: string;
  /** Server thumb (images) or poster variant (videos) — absent while uploading. */
  thumbUrl?: string;
  status: MediaItemStatus;
  /** Upload progress 0–100 (`uploading` only). */
  progress?: number;
  /** Persian failure reason (`error` only, mapped from the API status/code). */
  error?: string;
  /** Client-measured duration in ms (videos only; 0/undefined = unknown). */
  durationMs?: number;
}
