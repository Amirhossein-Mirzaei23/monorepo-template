'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { captureVideoPoster, describeUploadError, useMediaUpload } from '@/features/media';

/**
 * CHT-007 — the composer's attachment pipeline: pick file → direct-to-API
 * upload (MEDIA-004's XHR path, real progress) → on completion `onReady`
 * hands {kind, mediaAssetId, localPreviewUrl} to the send hook, whose POST
 * {type, mediaAssetId} turns the pending tile into an optimistic media
 * bubble.
 *
 * CLIENT CAPS (card: "5 images / 1 video per send batch", enforced here —
 * the API has no batch endpoint, so a batch IS the concurrent upload set):
 * - at most 5 IMAGE uploads in flight at once;
 * - at most 1 VIDEO upload in flight at once (heavy bytes + poster capture).
 * A pick past a cap is refused with a Persian `notice` (rendered above the
 * composer); nothing is enqueued.
 *
 * Failure/retry: a failed upload keeps its local preview tile with
 * retry/remove actions; retry re-runs the SAME upload (videos reuse the
 * already-captured poster + duration — no second seek pass). Remove drops
 * the tile (an in-flight XHR, if any, finishes into the void: completion
 * checks the live job map first and discards).
 *
 * Object-URL ownership: this hook mints each tile's local preview and hands
 * it over on success (the send hook revokes it when the optimistic bubble
 * retires) or revokes it itself on remove/unmount.
 */

export const MAX_CONCURRENT_IMAGE_UPLOADS = 5;
export const MAX_CONCURRENT_VIDEO_UPLOADS = 1;

/** jsdom-safe object URL revocation (not every environment implements it). */
function revokeObjectUrl(url: string | undefined): void {
  if (url && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

export type PendingUploadStatus = 'uploading' | 'failed';

export interface PendingUpload {
  /** Negative, decreasing per session — never collides with temp message ids. */
  uploadId: number;
  kind: 'IMAGE' | 'VIDEO';
  /** Object URL of the picked local file (the tile's preview). */
  localPreviewUrl: string;
  /** Upload progress 0–100 (`uploading` only). */
  progress: number;
  status: PendingUploadStatus;
  /** Persian failure reason (`failed` only, mapped from the API error). */
  error?: string;
}

export interface UploadedAttachment {
  kind: 'IMAGE' | 'VIDEO';
  mediaAssetId: string;
  /** The tile's local preview — handed to the optimistic media bubble. */
  localPreviewUrl: string;
}

export interface UseAttachmentSendOptions {
  /** Called when an upload commits — wire this to useSendMessage().sendMedia. */
  onReady: (attachment: UploadedAttachment) => void;
}

export interface UseAttachmentSendResult {
  pendingUploads: PendingUpload[];
  attachImage: (file: File) => void;
  attachVideo: (file: File) => void;
  retry: (uploadId: number) => void;
  remove: (uploadId: number) => void;
  /** Transient Persian notice (cap refusal) — render above the composer. */
  notice: string | null;
  dismissNotice: () => void;
}

interface UploadJob {
  file: File;
  /** Captured once per pick (videos): reused on retry. */
  poster: File | null;
  durationMs: number;
}

export function useAttachmentSend(options: UseAttachmentSendOptions): UseAttachmentSendResult {
  const { uploadImage, uploadVideo } = useMediaUpload();
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const nextUploadIdRef = useRef(0);
  const jobsRef = useRef(new Map<number, UploadJob>());
  const pendingRef = useRef<PendingUpload[]>([]);
  useEffect(() => {
    pendingRef.current = pendingUploads;
  }, [pendingUploads]);
  // Latest onReady without re-creating the upload closures below.
  const onReadyRef = useRef(options.onReady);
  useEffect(() => {
    onReadyRef.current = options.onReady;
  }, [options.onReady]);

  const patch = useCallback((uploadId: number, changes: Partial<PendingUpload>) => {
    setPendingUploads((items) =>
      items.map((item) => (item.uploadId === uploadId ? { ...item, ...changes } : item)),
    );
  }, []);

  const runJob = useCallback(
    async (uploadId: number, kind: 'IMAGE' | 'VIDEO') => {
      const job = jobsRef.current.get(uploadId);
      if (!job) {
        return;
      }
      try {
        const response =
          kind === 'IMAGE'
            ? await uploadImage(job.file, (percent) => patch(uploadId, { progress: percent }))
            : await uploadVideo(
                { file: job.file, poster: job.poster, durationMs: job.durationMs },
                (percent) => patch(uploadId, { progress: percent }),
              );
        // Removed mid-flight? Then the preview was already revoked — discard.
        if (!jobsRef.current.has(uploadId)) {
          return;
        }
        jobsRef.current.delete(uploadId);
        const preview = pendingRef.current.find(
          (item) => item.uploadId === uploadId,
        )?.localPreviewUrl;
        setPendingUploads((items) => items.filter((item) => item.uploadId !== uploadId));
        // Ownership of the object URL moves to the send hook (revoked there
        // when the optimistic media bubble retires).
        onReadyRef.current({ kind, mediaAssetId: response.id, localPreviewUrl: preview ?? '' });
      } catch (error) {
        if (jobsRef.current.has(uploadId)) {
          patch(uploadId, { status: 'failed', error: describeUploadError(error) });
        }
      }
    },
    [patch, uploadImage, uploadVideo],
  );

  const enqueue = useCallback(
    (kind: 'IMAGE' | 'VIDEO', file: File) => {
      const uploading = pendingRef.current.filter(
        (item) => item.kind === kind && item.status === 'uploading',
      ).length;
      const cap = kind === 'IMAGE' ? MAX_CONCURRENT_IMAGE_UPLOADS : MAX_CONCURRENT_VIDEO_UPLOADS;
      if (uploading >= cap) {
        setNotice(
          kind === 'IMAGE'
            ? 'حداکثر ۵ تصویر را همزمان می‌توانید بفرستید'
            : 'یک ویدیو همزمان قابل ارسال است؛ منتظر بمانید',
        );
        return;
      }
      nextUploadIdRef.current -= 1;
      const uploadId = nextUploadIdRef.current;
      jobsRef.current.set(uploadId, { file, poster: null, durationMs: 0 });
      setPendingUploads((items) => [
        ...items,
        {
          uploadId,
          kind,
          localPreviewUrl: URL.createObjectURL(file),
          progress: 0,
          status: 'uploading',
        },
      ]);
      setNotice(null);
      if (kind === 'VIDEO') {
        // Poster capture BEFORE the XHR (decision D10): failures proceed
        // poster-less — the API stores a generic icon (MEDIA-003).
        void captureVideoPoster(file)
          .then((captured) => {
            const job = jobsRef.current.get(uploadId);
            if (job) {
              job.poster = captured.poster;
              job.durationMs = captured.durationMs;
            }
          })
          .catch(() => undefined)
          .finally(() => {
            void runJob(uploadId, kind);
          });
      } else {
        void runJob(uploadId, kind);
      }
    },
    [runJob],
  );

  const attachImage = useCallback((file: File) => enqueue('IMAGE', file), [enqueue]);
  const attachVideo = useCallback((file: File) => enqueue('VIDEO', file), [enqueue]);

  const retry = useCallback(
    (uploadId: number) => {
      const tile = pendingRef.current.find((item) => item.uploadId === uploadId);
      if (!tile || tile.status !== 'failed' || !jobsRef.current.has(uploadId)) {
        return;
      }
      patch(uploadId, { status: 'uploading', progress: 0, error: undefined });
      void runJob(uploadId, tile.kind);
    },
    [patch, runJob],
  );

  const remove = useCallback((uploadId: number) => {
    const tile = pendingRef.current.find((item) => item.uploadId === uploadId);
    revokeObjectUrl(tile?.localPreviewUrl);
    jobsRef.current.delete(uploadId);
    setPendingUploads((items) => items.filter((item) => item.uploadId !== uploadId));
  }, []);

  // Unmount: revoke previews of tiles still in the list (handed-over ones
  // belong to the send hook now).
  useEffect(() => {
    const tiles = pendingRef.current;
    return () => {
      for (const tile of tiles) {
        revokeObjectUrl(tile.localPreviewUrl);
      }
    };
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return { pendingUploads, attachImage, attachVideo, retry, remove, notice, dismissNotice };
}
