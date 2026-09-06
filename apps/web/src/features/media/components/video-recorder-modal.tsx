'use client';

import { TriangleAlert, Video } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  VIDEO_ACCEPT_TYPES,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_DURATION_MS,
  formatVideoDuration,
} from '../lib/limits';
import { captureVideoPoster } from '../lib/poster-capture';

/**
 * MEDIA-004 — lightweight video picker modal.
 *
 * Documented simplification (card decision): native camera capture via
 * `<input capture>` already covers mobile recording, so this is NOT a custom
 * MediaRecorder implementation — it wraps a `video/mp4,video/webm` file input
 * (mobile OSes offer the camera there) with the limits hint copy, a client
 * poster/duration capture preview and confirm/cancel. Live MediaRecorder
 * capture is deferred; the uploader API stays unchanged when it lands.
 */

export interface VideoRecordPayload {
  file: File;
  /** Captured poster (null when the browser could not produce one). */
  poster: File | null;
  /** Client-measured duration in ms — 0 when unknown (server decides then). */
  durationMs: number;
}

export interface VideoRecorderModalProps {
  open: boolean;
  onClose: () => void;
  /** Confirmed pick — the modal resets itself after calling this. */
  onConfirm: (payload: VideoRecordPayload) => void;
  disabled?: boolean;
}

interface PickedVideo {
  file: File;
  poster: File | null;
  posterUrl: string | null;
  durationMs: number;
  /** Capture succeeded but exceeded VIDEO_MAX_DURATION_MS — confirm blocked. */
  tooLong: boolean;
}

export function VideoRecorderModal({
  open,
  onClose,
  onConfirm,
  disabled,
}: VideoRecorderModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const posterUrlRef = useRef<string | null>(null);
  const [picked, setPicked] = useState<PickedVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const revokePosterUrl = useCallback(() => {
    if (posterUrlRef.current) {
      URL.revokeObjectURL(posterUrlRef.current);
      posterUrlRef.current = null;
    }
  }, []);

  // Every close (overlay, Escape, انصراف) and the confirm flow through here, so
  // the flow resets without needing a state-writing effect.
  const reset = useCallback(() => {
    setPicked(null);
    setError(null);
    setCapturing(false);
    revokePosterUrl();
  }, [revokePosterUrl]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleConfirm = useCallback(() => {
    if (!picked) {
      return;
    }
    onConfirm({ file: picked.file, poster: picked.poster, durationMs: picked.durationMs });
    reset();
  }, [onConfirm, picked, reset]);

  // Unmount cleanup for the blob URL (external-system cleanup only).
  useEffect(() => revokePosterUrl, [revokePosterUrl]);

  // Escape + minimal focus trap, subscribed on the window (ui-patterns: sheets
  // are focus-trapped; dialogs close on Escape).
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        handleClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) {
        return;
      }
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [href]',
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  // Initial focus lands on the primary action (programmatic — no autoFocus prop).
  useEffect(() => {
    if (open) {
      primaryActionRef.current?.focus();
    }
  }, [open]);

  const handleFile = async (file: File | undefined): Promise<void> => {
    if (!file || capturing) {
      return;
    }
    setError(null);
    if (file.size > VIDEO_MAX_BYTES) {
      setError('حجم ویدیو نباید بیش از ۵۰ مگابایت باشد');
      return;
    }
    setCapturing(true);
    try {
      const { poster, durationMs } = await captureVideoPoster(file);
      revokePosterUrl();
      const posterUrl = URL.createObjectURL(poster);
      posterUrlRef.current = posterUrl;
      setPicked({
        file,
        poster,
        posterUrl,
        durationMs,
        tooLong: durationMs > VIDEO_MAX_DURATION_MS,
      });
    } catch {
      setError('ویدیو قابل پخش نیست؛ فایل دیگری انتخاب کنید');
    } finally {
      setCapturing(false);
    }
  };

  if (!open) {
    return null;
  }

  const canConfirm = !disabled && !capturing && picked !== null && !picked.tooLong;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        tabIndex={-1}
        aria-label="بستن"
        className="bg-zinc-950/60 absolute inset-0 cursor-default"
        onClick={handleClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="افزودن ویدیو"
        className="bg-background relative w-full rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-sm sm:max-w-md sm:rounded-2xl"
      >
        <span
          aria-hidden="true"
          className="bg-border mx-auto mb-4 block h-1 w-10 rounded-full sm:hidden"
        />

        <h2 className="text-base font-semibold">افزودن ویدیو</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          حداکثر ۶۰ ثانیه — فرمت mp4 یا webm، تا ۵۰ مگابایت
        </p>

        {error ? (
          <p role="alert" className="text-destructive mt-3 flex items-center gap-1.5 text-sm">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        {picked?.tooLong ? (
          <p role="alert" className="text-destructive mt-3 flex items-center gap-1.5 text-sm">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            طول ویدیو بیش از ۶۰ ثانیه مجاز نیست؛ ویدیوی کوتاه‌تری انتخاب کنید
          </p>
        ) : null}

        {picked && picked.posterUrl ? (
          <div className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob poster preview, optimization not applicable */}
            <img
              src={picked.posterUrl}
              alt="پیش‌نمایش ویدیو"
              className="border-border aspect-video w-full rounded-xl border object-cover"
            />
            {picked.durationMs > 0 ? (
              <p className="text-muted-foreground mt-2 text-sm">
                مدت ویدیو: {formatVideoDuration(picked.durationMs)}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="bg-muted text-muted-foreground mt-4 flex aspect-video w-full items-center justify-center rounded-xl border border-dashed">
            <Video className="size-10" aria-hidden="true" />
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={VIDEO_ACCEPT_TYPES}
          className="sr-only"
          aria-label="انتخاب فایل ویدیو"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />

        <div className="mt-5 flex items-center gap-2">
          {picked ? (
            <>
              <Button
                ref={primaryActionRef}
                type="button"
                disabled={!canConfirm}
                className="min-h-11 flex-1"
                onClick={handleConfirm}
              >
                افزودن ویدیو
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={capturing}
                className="min-h-11"
                onClick={() => inputRef.current?.click()}
              >
                انتخاب دوباره
              </Button>
            </>
          ) : (
            <Button
              ref={primaryActionRef}
              type="button"
              disabled={disabled || capturing}
              className="min-h-11 flex-1"
              onClick={() => inputRef.current?.click()}
            >
              {capturing ? 'در حال آماده‌سازی…' : 'ضبط یا انتخاب ویدیو'}
            </Button>
          )}
          <Button type="button" variant="ghost" className="min-h-11" onClick={handleClose}>
            انصراف
          </Button>
        </div>
      </div>
    </div>
  );
}
