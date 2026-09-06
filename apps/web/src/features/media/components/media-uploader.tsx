'use client';

import { Camera, Clapperboard, ImagePlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatFaDigits } from '@/lib/format';
import { compressImage } from '../lib/compress';
import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES, VIDEO_MAX_DURATION_MS } from '../lib/limits';
import { describeUploadError, useMediaUpload } from '../hooks/use-upload';
import type { MediaItem } from '../types';
import { MediaGrid } from './media-grid';
import { VideoRecorderModal, type VideoRecordPayload } from './video-recorder-modal';

export const DEFAULT_IMAGES_MAX = 15;
export const DEFAULT_VIDEOS_MAX = 3;

export interface MediaUploaderProps {
  /** Controlled tile list — order matters: index 0 is the cover. */
  value: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  /** Per-context caps (lot wizard 15/3, chat/avatar override). */
  imagesMax?: number;
  videosMax?: number;
  disabled?: boolean;
  className?: string;
}

/** Files kept per tile so a failed upload can be retried without re-picking. */
interface TileFiles {
  file: File;
  poster: File | null;
  durationMs: number;
}

/** Non-error tiles of a kind count against the caps (failed tiles don't). */
function countKind(items: MediaItem[], kind: MediaItem['kind']): number {
  return items.filter((item) => item.kind === kind && item.status !== 'error').length;
}

/**
 * MEDIA-004 shared media uploader (lot wizard / chat / avatar consumers).
 * Pick (camera/gallery/video modal) → client pre-checks (limits are UX only —
 * the server stays the source of truth) → compress (images) / poster capture
 * (videos) → XHR upload with per-tile progress → ready tile. Failed tiles keep
 * their file for retry; every tile can be removed; ready tiles reorder
 * (tap-to-swap in «مرتب‌سازی» mode) and any ready tile can become the cover.
 */
export function MediaUploader({
  value,
  onChange,
  imagesMax = DEFAULT_IMAGES_MAX,
  videosMax = DEFAULT_VIDEOS_MAX,
  disabled = false,
  className,
}: MediaUploaderProps) {
  const { uploadImage, uploadVideo } = useMediaUpload();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const keyCounterRef = useRef(0);

  // Mirrors `value` so async upload callbacks and same-tick commits always
  // operate on the freshest list, never a stale closure. `commit` keeps it in
  // sync for self-initiated updates; the effect catches up with parent-driven
  // value changes.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const filesRef = useRef(new Map<string, TileFiles>());
  const runnersRef = useRef(new Map<string, () => Promise<void>>());
  const objectUrlsRef = useRef(new Map<string, string>());

  const [preCheckError, setPreCheckError] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const commit = useCallback(
    (items: MediaItem[]) => {
      valueRef.current = items;
      onChange(items);
    },
    [onChange],
  );

  const updateItem = useCallback(
    (key: string, patch: Partial<MediaItem>) => {
      const items = valueRef.current;
      if (!items.some((item) => item.key === key)) {
        return; // removed mid-upload — discard the late result
      }
      commit(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    },
    [commit],
  );

  const revokeObjectUrl = useCallback((key: string) => {
    const url = objectUrlsRef.current.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrlsRef.current.delete(key);
    }
  }, []);

  const nextKey = useCallback(() => {
    keyCounterRef.current += 1;
    return `media-${keyCounterRef.current}`;
  }, []);

  const makeRunner = useCallback(
    (key: string, kind: MediaItem['kind'], tileFiles: TileFiles) => {
      const runner = async (): Promise<void> => {
        try {
          if (kind === 'image') {
            const processed = await compressImage(tileFiles.file);
            filesRef.current.set(key, { file: processed, poster: null, durationMs: 0 });
            const response = await uploadImage(processed, (progress) =>
              updateItem(key, { progress }),
            );
            revokeObjectUrl(key);
            updateItem(key, {
              status: 'ready',
              id: response.id,
              url: response.urls.original,
              thumbUrl: response.urls.thumb,
              progress: 100,
              error: undefined,
            });
            setLiveMessage('آپلود تصویر کامل شد');
          } else {
            const response = await uploadVideo(
              {
                file: tileFiles.file,
                poster: tileFiles.poster,
                durationMs: tileFiles.durationMs,
              },
              (progress) => updateItem(key, { progress }),
            );
            revokeObjectUrl(key);
            updateItem(key, {
              status: 'ready',
              id: response.id,
              url: response.urls.video,
              thumbUrl: response.urls.posterThumb ?? response.urls.poster,
              progress: 100,
              error: undefined,
            });
            setLiveMessage('آپلود ویدیو کامل شد');
          }
        } catch (error) {
          filesRef.current.set(key, tileFiles); // original kept — retry re-runs everything
          updateItem(key, { status: 'error', error: describeUploadError(error) });
          setLiveMessage('آپلود ناموفق بود');
        }
      };
      return runner;
    },
    [revokeObjectUrl, updateItem, uploadImage, uploadVideo],
  );

  const handlePickedImages = useCallback(
    (fileList: FileList | null) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0) {
        return;
      }
      const remaining = imagesMax - countKind(valueRef.current, 'image');
      if (remaining <= 0) {
        setPreCheckError(`حداکثر ${formatFaDigits(imagesMax)} تصویر مجاز است`);
        return;
      }
      const accepted: File[] = [];
      let rejection: string | null = null;
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          rejection ??= 'فقط فایل تصویری مجاز است';
        } else if (file.size > IMAGE_MAX_BYTES) {
          rejection ??= 'حجم تصویر نباید بیش از ۱۰ مگابایت باشد';
        } else if (accepted.length < remaining) {
          accepted.push(file);
        }
      }
      if (accepted.length === 0) {
        setPreCheckError(rejection ?? `حداکثر ${formatFaDigits(imagesMax)} تصویر مجاز است`);
        return;
      }
      setPreCheckError(
        accepted.length < files.length
          ? (rejection ??
              `حداکثر ${formatFaDigits(imagesMax)} تصویر مجاز است — بقیه نادیده گرفته شد`)
          : null,
      );
      for (const file of accepted) {
        const key = nextKey();
        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.set(key, previewUrl);
        const tileFiles: TileFiles = { file, poster: null, durationMs: 0 };
        filesRef.current.set(key, tileFiles);
        commit([
          ...valueRef.current,
          { key, kind: 'image', url: previewUrl, status: 'uploading', progress: 0 },
        ]);
        const runner = makeRunner(key, 'image', tileFiles);
        runnersRef.current.set(key, runner);
        void runner();
      }
    },
    [commit, imagesMax, makeRunner, nextKey],
  );

  const handleVideoConfirmed = useCallback(
    (payload: VideoRecordPayload) => {
      setVideoModalOpen(false);
      if (countKind(valueRef.current, 'video') >= videosMax) {
        setPreCheckError(`حداکثر ${formatFaDigits(videosMax)} ویدیو مجاز است`);
        return;
      }
      if (payload.file.size > VIDEO_MAX_BYTES) {
        setPreCheckError('حجم ویدیو نباید بیش از ۵۰ مگابایت باشد');
        return;
      }
      if (payload.durationMs > VIDEO_MAX_DURATION_MS) {
        setPreCheckError('طول ویدیو بیش از ۶۰ ثانیه مجاز نیست');
        return;
      }
      const key = nextKey();
      let previewUrl: string | null = null;
      if (payload.poster) {
        previewUrl = URL.createObjectURL(payload.poster);
        objectUrlsRef.current.set(key, previewUrl);
      }
      const tileFiles: TileFiles = {
        file: payload.file,
        poster: payload.poster,
        durationMs: payload.durationMs,
      };
      filesRef.current.set(key, tileFiles);
      commit([
        ...valueRef.current,
        {
          key,
          kind: 'video',
          url: previewUrl ?? '',
          status: 'uploading',
          progress: 0,
          durationMs: payload.durationMs > 0 ? payload.durationMs : undefined,
        },
      ]);
      const runner = makeRunner(key, 'video', tileFiles);
      runnersRef.current.set(key, runner);
      void runner();
    },
    [commit, makeRunner, nextKey, videosMax],
  );

  const handleRetry = useCallback(
    (key: string) => {
      const runner = runnersRef.current.get(key);
      if (!runner || !filesRef.current.has(key)) {
        return;
      }
      setPreCheckError(null);
      updateItem(key, { status: 'uploading', progress: 0, error: undefined });
      void runner();
    },
    [updateItem],
  );

  const handleRemove = useCallback(
    (key: string) => {
      revokeObjectUrl(key);
      filesRef.current.delete(key);
      runnersRef.current.delete(key);
      if (selectedKey === key) {
        setSelectedKey(null);
      }
      commit(valueRef.current.filter((item) => item.key !== key));
    },
    [commit, revokeObjectUrl, selectedKey],
  );

  const handleSetCover = useCallback(
    (key: string) => {
      const items = valueRef.current;
      const index = items.findIndex((item) => item.key === key);
      if (index <= 0 || items[index]?.status !== 'ready') {
        return;
      }
      const item = items[index];
      commit([item, ...items.filter((other) => other.key !== key)]);
    },
    [commit],
  );

  const handleMove = useCallback(
    (key: string, direction: -1 | 1) => {
      const items = [...valueRef.current];
      const index = items.findIndex((item) => item.key === key);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= items.length) {
        return;
      }
      const current = items[index];
      const neighbour = items[target];
      if (!current || !neighbour) {
        return;
      }
      items[index] = neighbour;
      items[target] = current;
      commit(items);
    },
    [commit],
  );

  /** Tap-to-swap: first tap selects, second tap swaps the two tiles. */
  const handleTileActivate = useCallback(
    (key: string) => {
      if (selectedKey === null) {
        setSelectedKey(key);
        return;
      }
      if (selectedKey === key) {
        setSelectedKey(null);
        return;
      }
      const items = [...valueRef.current];
      const from = items.findIndex((item) => item.key === selectedKey);
      const to = items.findIndex((item) => item.key === key);
      const moving = items[from];
      const target = items[to];
      if (from === -1 || to === -1 || !moving || !target) {
        setSelectedKey(null);
        return;
      }
      items[from] = target;
      items[to] = moving;
      commit(items);
      setSelectedKey(null);
    },
    [commit, selectedKey],
  );

  const imageCount = countKind(value, 'image');
  const videoCount = countKind(value, 'video');
  const canEdit = useMemo(
    () => value.some((item) => item.status === 'ready') && value.length >= 2,
    [value],
  );
  const inputsDisabled = disabled;

  return (
    <div className={className}>
      <p className="sr-only" aria-live="polite">
        {liveMessage}
      </p>

      {preCheckError ? (
        <p role="alert" className="text-destructive mb-3 text-sm">
          {preCheckError}
        </p>
      ) : null}

      {value.length > 0 ? (
        <MediaGrid
          items={value}
          editMode={editMode}
          selectedKey={selectedKey}
          onTileActivate={handleTileActivate}
          onMove={handleMove}
          onSetCover={handleSetCover}
          onRetry={handleRetry}
          onRemove={handleRemove}
        />
      ) : (
        <p className="text-muted-foreground mb-3 text-sm">اولین رسانه، کاور اصلی می‌شود.</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {formatFaDigits(imageCount)} از {formatFaDigits(imagesMax)} تصویر ·{' '}
          {formatFaDigits(videoCount)} از {formatFaDigits(videosMax)} ویدیو
        </p>
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={disabled}
            aria-pressed={editMode}
            onClick={() => {
              setEditMode((mode) => !mode);
              setSelectedKey(null);
            }}
          >
            {editMode ? 'پایان مرتب‌سازی' : 'مرتب‌سازی'}
          </Button>
        ) : null}
      </div>

      {editMode ? (
        <p className="text-muted-foreground mt-2 text-xs">
          یک رسانه را انتخاب کنید و روی رسانه‌ی دیگر بزنید تا جابه‌جا شوند.
        </p>
      ) : null}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-label="گرفتن عکس با دوربین"
        onChange={(event) => {
          handlePickedImages(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="انتخاب تصویر از گالری"
        onChange={(event) => {
          handlePickedImages(event.target.files);
          event.target.value = '';
        }}
      />

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 flex-col gap-1 text-xs"
          disabled={inputsDisabled || imageCount >= imagesMax}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera className="size-5" aria-hidden="true" />
          دوربین
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 flex-col gap-1 text-xs"
          disabled={inputsDisabled || imageCount >= imagesMax}
          onClick={() => galleryInputRef.current?.click()}
        >
          <ImagePlus className="size-5" aria-hidden="true" />
          گالری
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 flex-col gap-1 text-xs"
          disabled={inputsDisabled || videoCount >= videosMax}
          onClick={() => setVideoModalOpen(true)}
        >
          <Clapperboard className="size-5" aria-hidden="true" />
          ویدیو
        </Button>
      </div>

      <VideoRecorderModal
        open={videoModalOpen}
        disabled={disabled}
        onClose={() => setVideoModalOpen(false)}
        onConfirm={handleVideoConfirmed}
      />
    </div>
  );
}
