'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, SendHorizontal, Video } from 'lucide-react';
import { formatFaDigits } from '@/lib/format';
import { MESSAGE_BODY_MAX_LENGTH } from '../api/chat-api';

/**
 * CHT-006 — the sticky composer: an auto-growing textarea (1–4 lines) and a
 * mirrored send button (≥ 44px target). Card mechanics:
 *
 * - send disabled while the thread loads, when the trimmed body is empty, or
 *   past the CHT-003 bound (2000 chars post-trim); a live counter appears
 *   past 1800 chars and turns red past the bound;
 * - Enter sends, Shift+Enter inserts a newline (IME-safe: composition
 *   keystrokes never send);
 * - every keystroke notifies the throttled typing emitter (use-typing).
 *
 * CHT-007 — attachments: an image button (accept="image/*" — mobile OS
 * pickers offer camera capture from this input; MEDIA-004's dedicated
 * capture="environment" input covers the explicit camera flow elsewhere)
 * and a video button (accept="video/mp4,video/webm"). A picked file goes to
 * onAttachImage/onAttachVideo (use-attachment-send: upload with progress →
 * auto-send); uploads are upload-state, NOT composer text state.
 */

export interface ComposerProps {
  conversationId: string;
  /** Thread still loading — no sends until the history is in place. */
  disabled?: boolean;
  isSending?: boolean;
  onSend: (body: string) => void;
  /** Throttled typing notifier (useTypingEmitter) — called on every input. */
  onTyping: () => void;
  /** CHT-007 — image picked → upload pipeline (use-attachment-send). */
  onAttachImage?: (file: File) => void;
  /** CHT-007 — video picked → upload pipeline (use-attachment-send). */
  onAttachVideo?: (file: File) => void;
}

/** Char count past which the «x / ۲۰۰۰» counter becomes visible. */
export const MESSAGE_BODY_COUNTER_THRESHOLD = 1800;

/** Auto-grow cap — 4 lines at leading-6. */
const TEXTAREA_MAX_HEIGHT_PX = 96;

export function Composer({
  conversationId,
  disabled = false,
  isSending = false,
  onSend,
  onTyping,
  onAttachImage,
  onAttachVideo,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const trimmedLength = value.trim().length;
  const canSend =
    !disabled && !isSending && trimmedLength > 0 && trimmedLength <= MESSAGE_BODY_MAX_LENGTH;
  const showCounter = value.length > MESSAGE_BODY_COUNTER_THRESHOLD;
  const overLimit = trimmedLength > MESSAGE_BODY_MAX_LENGTH;

  // Auto-grow: reset then clamp to the 4-line cap (overflow scrolls).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
  }, [value]);

  const submit = () => {
    if (!canSend) {
      return;
    }
    onSend(value);
    setValue('');
  };

  const pickFile = (input: HTMLInputElement | null): void => {
    const file = input?.files?.[0];
    // Reset so picking the SAME file again re-fires onChange.
    if (input) {
      input.value = '';
    }
    if (!file) {
      return;
    }
    if (file.type.startsWith('video/')) {
      onAttachVideo?.(file);
    } else if (file.type.startsWith('image/')) {
      onAttachImage?.(file);
    }
  };

  return (
    <form
      className="border-border bg-card flex items-end gap-2 border-t p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      aria-label={`ارسال پیام در گفتگو ${conversationId}`}
    >
      {onAttachImage || onAttachVideo ? (
        <div className="flex shrink-0 items-center gap-1 pb-0.5">
          {onAttachImage ? (
            <>
              <button
                type="button"
                aria-label="ارسال تصویر"
                disabled={disabled}
                onClick={() => imageInputRef.current?.click()}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex size-10 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ImagePlus className="size-5" aria-hidden="true" />
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={() => pickFile(imageInputRef.current)}
              />
            </>
          ) : null}
          {onAttachVideo ? (
            <>
              <button
                type="button"
                aria-label="ارسال ویدیو"
                disabled={disabled}
                onClick={() => videoInputRef.current?.click()}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex size-10 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Video className="size-5" aria-hidden="true" />
              </button>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={() => pickFile(videoInputRef.current)}
              />
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex-1">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            onTyping();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
          placeholder="پیام…"
          aria-label="متن پیام"
          className="border-border focus-visible:ring-ring/50 max-h-24 w-full resize-none rounded-xl border bg-transparent px-3 py-2.5 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60"
        />
        {showCounter ? (
          <p
            className={
              overLimit
                ? 'text-red-600 mt-1 text-end text-[11px]'
                : 'text-muted-foreground mt-1 text-end text-[11px]'
            }
          >
            {formatFaDigits(value.length)} / {formatFaDigits(MESSAGE_BODY_MAX_LENGTH)}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={!canSend}
        aria-label="ارسال"
        className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring/50 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          // RTL mirror: the send glyph points the other way (ui-patterns.md).
          <SendHorizontal className="size-5 -scale-x-100" aria-hidden="true" />
        )}
      </button>
    </form>
  );
}
