'use client';

import { useLayoutEffect, useRef } from 'react';
import { RotateCcw, WifiOff } from 'lucide-react';
import type { MessageResponseDto } from '@monorepo/shared-types';
import { formatJalali } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useAttachmentSend } from '../hooks/use-attachment-send';
import { useConversationChannel } from '../hooks/use-conversation-channel';
import { useConversationContext } from '../hooks/use-conversation-context';
import { useMarkRead } from '../hooks/use-mark-read';
import { useMessages } from '../hooks/use-messages';
import { useSendMessage } from '../hooks/use-send-message';
import { useTypingEmitter, useTypingIndicator } from '../hooks/use-typing';
import { Composer } from './composer';
import { LotContextHeader } from './lot-context-header';
import { MediaBubble } from './media-bubble';
import { MediaBubblePending } from './media-bubble-pending';
import { MessageBubble } from './message-bubble';

/**
 * CHT-006 — the /chat/:id thread body: lot-context header + message list +
 * composer, with the card's realtime mechanics wired:
 *
 * - WS room lifecycle (subscribe on mount / re-join on reconnect /
 *   unsubscribe on unmount) via use-conversation-channel;
 * - read receipts on mount + on focused `message:new` (use-mark-read);
 * - typing dots with the 3 s TTL (use-typing) and the throttled composer emit;
 * - WS fallback: while `pollingActive` the history query polls every 15 s and
 *   an amber status badge explains the degraded mode (never an error).
 *
 * CHT-007 — media: the composer's picked files flow through
 * use-attachment-send (XHR upload with progress + caps); a committed upload
 * becomes an optimistic media bubble (use-send-message.sendMedia). The list
 * renders IMAGE/VIDEO server rows through MediaBubble (authed fetch → blob
 * URL), and in-flight upload tiles sit with the optimistic sends at the
 * bottom.
 *
 * Scroll management (the card's "without jump" acceptance):
 * - first load snaps to the newest message instantly;
 * - a new message scrolls the list only when the user already lives at the
 *   bottom (80px threshold) — scrolled-up readers are never yanked down;
 * - back-pagination (scroll-top / «پیام‌های قدیمی‌تر») PREPENDS older history
 *   and restores the viewport anchor by the height delta, so history loads
 *   without a jump.
 */

/** Distance from the bottom inside which the user counts as "at the bottom". */
const AT_BOTTOM_THRESHOLD_PX = 80;
/** Scroll-top distance that triggers loading older history. */
const LOAD_OLDER_TRIGGER_PX = 64;

export function ChatThread({ conversationId }: { conversationId: string }) {
  const context = useConversationContext(conversationId);
  const thread = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const attachments = useAttachmentSend({
    onReady: ({ kind, mediaAssetId, localPreviewUrl }) =>
      send.sendMedia(kind, mediaAssetId, localPreviewUrl),
  });
  const notifyTyping = useTypingEmitter(conversationId);
  const counterpartTyping = useTypingIndicator(conversationId);

  // Room lifecycle + read receipts (token-gated inside the hooks).
  useConversationChannel(conversationId);
  useMarkRead(conversationId);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const pendingRestoreRef = useRef<number | null>(null);
  const initialScrollDoneRef = useRef(false);

  const loadOlder = () => {
    const el = scrollerRef.current;
    if (!el || !thread.hasPreviousPage || thread.isFetchingPreviousPage) {
      return;
    }
    pendingRestoreRef.current = el.scrollHeight;
    thread.fetchPreviousPage();
  };

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    // 1) History prepend — wait for the fetch to commit, then re-anchor the
    // viewport on the same messages by the grown height.
    if (pendingRestoreRef.current !== null) {
      if (thread.isFetchingPreviousPage) {
        return;
      }
      const delta = el.scrollHeight - pendingRestoreRef.current;
      pendingRestoreRef.current = null;
      if (delta > 0) {
        el.scrollTop += delta;
      }
      return;
    }
    if (thread.isLoading) {
      return;
    }
    // 2) First finished load — snap to the newest message instantly.
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      el.scrollTop = el.scrollHeight;
      return;
    }
    // 3) New message while the user lives at the bottom — follow it.
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [thread.messages.length, thread.isLoading, thread.isFetchingPreviousPage]);

  const { user } = useAuth();
  const myId = user?.id;

  const rows = buildRows(thread.messages, send.pending, myId, send.retry);
  // CHT-007 — optimistic MEDIA bubbles (upload committed, POST in flight):
  // rendered as preview tiles (the authed-fetch bubble needs the server keys
  // first); buildRows only maps TEXT pendings.
  const mediaPendings = send.pending.filter((item) => item.media !== undefined);

  return (
    <section
      // App chrome estimate: AuthHeader (~48px) + main padding (48px).
      className="border-border bg-card mx-auto flex h-[calc(100dvh-6rem)] min-h-96 w-full max-w-2xl flex-col overflow-hidden rounded-xl border"
      aria-label="گفتگو"
    >
      <LotContextHeader lot={context.conversation?.lot} loading={context.isLoading} />

      {thread.pollingActive ? (
        <p
          role="status"
          className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          اتصال زنده قطع است — پیام‌ها هر ۱۵ ثانیه به‌روزرسانی می‌شوند
        </p>
      ) : null}

      <div
        ref={scrollerRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          atBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD_PX;
          if (el.scrollTop < LOAD_OLDER_TRIGGER_PX) {
            loadOlder();
          }
        }}
        className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3"
      >
        {thread.isError && thread.messages.length === 0 ? (
          <div
            role="alert"
            className="border-border grid place-items-center gap-3 rounded-xl border p-8 text-center"
          >
            <p className="text-sm font-medium">دریافت پیام‌ها ناموفق بود</p>
            <Button variant="outline" size="sm" className="mx-auto" onClick={thread.refetch}>
              <RotateCcw className="size-4" aria-hidden="true" />
              تلاش مجدد
            </Button>
          </div>
        ) : (
          <>
            {thread.hasPreviousPage ? (
              <div className="flex justify-center py-1">
                {thread.isFetchingPreviousPage ? (
                  <p className="text-muted-foreground text-xs">در حال بارگذاری تاریخچه…</p>
                ) : (
                  <Button variant="ghost" size="sm" className="mx-auto" onClick={loadOlder}>
                    پیام‌های قدیمی‌تر
                  </Button>
                )}
              </div>
            ) : null}

            {rows.map((row) => {
              if (row.kind === 'day') {
                return (
                  <div
                    key={row.key}
                    className="mx-auto w-fit rounded-full bg-zinc-100 px-3 py-1 text-center text-[11px] text-zinc-500"
                  >
                    {row.label}
                  </div>
                );
              }
              if (row.kind === 'media') {
                return (
                  <MediaBubble
                    key={row.key}
                    mediaType={row.mediaType}
                    storageKey={row.storageKey}
                    previewKey={row.previewKey}
                    createdAt={row.createdAt}
                    variant={row.variant}
                    readAt={row.readAt}
                  />
                );
              }
              return (
                <MessageBubble
                  key={row.key}
                  body={row.body}
                  createdAt={row.createdAt}
                  variant={row.variant}
                  readAt={row.readAt}
                  status={row.status}
                  onRetry={row.onRetry}
                />
              );
            })}

            {attachments.pendingUploads.map((upload) => (
              <MediaBubblePending
                key={upload.uploadId}
                kind={upload.kind}
                localPreviewUrl={upload.localPreviewUrl}
                status={upload.status}
                progress={upload.progress}
                error={upload.error}
                onRetry={
                  upload.status === 'failed' ? () => attachments.retry(upload.uploadId) : undefined
                }
                onRemove={
                  upload.status === 'failed' ? () => attachments.remove(upload.uploadId) : undefined
                }
              />
            ))}

            {mediaPendings.map((item) => (
              <MediaBubblePending
                key={`temp-${item.tempId}`}
                kind={item.media?.type ?? 'IMAGE'}
                localPreviewUrl={item.media?.localPreviewUrl ?? ''}
                status={item.status === 'failed' ? 'failed' : 'uploading'}
                error={item.status === 'failed' ? 'ارسال ناموفق بود' : undefined}
                onRetry={item.status === 'failed' ? () => send.retry(item.tempId) : undefined}
                onRemove={item.status === 'failed' ? () => send.discard(item.tempId) : undefined}
              />
            ))}

            {counterpartTyping ? (
              <div className="flex justify-start">
                <div
                  role="status"
                  aria-label="طرف مقابل در حال نوشتن"
                  className="flex w-fit items-center gap-1 rounded-2xl rounded-ss-sm bg-zinc-100 px-3 py-2.5"
                >
                  <span className="size-1.5 animate-bounce rounded-full bg-zinc-400" />
                  <span className="size-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
                </div>
              </div>
            ) : null}

            {!thread.isLoading && rows.length === 0 && attachments.pendingUploads.length === 0 ? (
              <p className="text-muted-foreground mx-auto my-auto text-center text-sm">
                هنوز پیامی نیست — اولین پیام را بفرستید.
              </p>
            ) : null}
          </>
        )}
      </div>

      {attachments.notice ? (
        <p
          role="status"
          className="text-muted-foreground border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-700"
        >
          {attachments.notice}
          <button
            type="button"
            onClick={attachments.dismissNotice}
            aria-label="بستن اعلان"
            className="ms-2 cursor-pointer font-medium underline underline-offset-2"
          >
            بستن
          </button>
        </p>
      ) : null}

      <Composer
        conversationId={conversationId}
        disabled={thread.isLoading}
        onSend={send.send}
        onTyping={notifyTyping}
        onAttachImage={attachments.attachImage}
        onAttachVideo={attachments.attachVideo}
      />
    </section>
  );
}

type MessageRow =
  | {
      kind: 'media';
      key: string;
      mediaType: 'IMAGE' | 'VIDEO';
      storageKey: string;
      previewKey: string | null;
      createdAt: string;
      variant: 'own' | 'other';
      readAt?: string | null;
    }
  | {
      kind: 'message';
      key: string;
      body: string;
      createdAt: string;
      variant: 'own' | 'other' | 'system';
      readAt?: string | null;
      status?: 'sending' | 'failed';
      onRetry?: () => void;
    };

interface DayRow {
  kind: 'day';
  key: string;
  label: string;
}

/**
 * Interleaves Jalali day separators between date changes (formatJalali — the
 * card's separator format) and maps server + optimistic rows to bubble props.
 * SYSTEM rows (server-written welcome/notice) become centered gray pills;
 * IMAGE/VIDEO rows become MediaBubble rows (CHT-007 — WS `message:new`
 * arrivals render through the same mapping).
 */
function buildRows(
  messages: MessageResponseDto[],
  pending: ReturnType<typeof useSendMessage>['pending'],
  myId: string | undefined,
  retry: (tempId: number) => void,
): Array<MessageRow | DayRow> {
  const rows: Array<MessageRow | DayRow> = [];
  let lastDay: string | undefined;

  const pushDay = (createdAt: string) => {
    const day = formatJalali(createdAt);
    if (day !== lastDay) {
      lastDay = day;
      rows.push({ kind: 'day', key: `day-${day}`, label: day });
    }
  };

  for (const message of messages) {
    const isSystem = message.type === 'SYSTEM' || message.senderId === null;
    const isOwn = !isSystem && message.senderId === myId;
    pushDay(message.createdAt);
    if (
      !isSystem &&
      (message.type === 'IMAGE' || message.type === 'VIDEO') &&
      message.mediaStorageKey !== null
    ) {
      rows.push({
        kind: 'media',
        key: message.id,
        mediaType: message.type,
        storageKey: message.mediaStorageKey,
        previewKey: message.mediaPreviewKey,
        createdAt: message.createdAt,
        variant: isOwn ? 'own' : 'other',
        ...(isOwn ? { readAt: message.readAt } : {}),
      });
      continue;
    }
    rows.push({
      kind: 'message',
      key: message.id,
      body: message.body ?? '',
      createdAt: message.createdAt,
      variant: isSystem ? 'system' : isOwn ? 'own' : 'other',
      ...(isOwn ? { readAt: message.readAt } : {}),
    });
  }

  for (const item of pending) {
    if (item.media) {
      // CHT-007 — optimistic MEDIA bubbles render as preview tiles in the
      // thread body (see mediaPendings there), not as text bubbles.
      continue;
    }
    pushDay(item.createdAt);
    rows.push({
      kind: 'message',
      key: `temp-${item.tempId}`,
      body: item.body,
      createdAt: item.createdAt,
      variant: 'own',
      status: item.status,
      ...(item.status === 'failed' ? { onRetry: () => retry(item.tempId) } : {}),
    });
  }

  return rows;
}
