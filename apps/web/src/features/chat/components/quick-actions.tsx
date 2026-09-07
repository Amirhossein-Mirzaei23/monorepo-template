'use client';

import { useState } from 'react';
import type { ConversationRole, MessageResponseDto } from '@monorepo/shared-types';

/**
 * CHT-008 — contextual quick-action chips above the composer (the card's
 * "structured negotiation starters without over-engineering chat").
 *
 * - Every chip sends its fa template as a NORMAL TEXT message through the
 *   CHT-006 optimistic send flow (`onSend` → use-send-message) — no new
 *   message kind. Architectural note: `MessageType.ACTION` stays RESERVED in
 *   the generated enum for future structured payloads (e.g. real offer
 *   cards); this feature deliberately does not use it.
 * - Role mapping (the card's "buyer-side chips; seller sees mirrored info
 *   chips only"):
 *     buyer  → «قیمت بپرس» / «عکس بیشتری بفرست» / «ویدیو بفرست» /
 *             «هماهنگی بازدید» — negotiation REQUEST starters (buyer → seller).
 *     seller → «ارسال عکس بیشتر» (the mirrored PROMISE template) +
 *             «هماهنگی بازدید» (either side may propose a visit slot; the real
 *             inspection workflow is TRS-007 — this chip only sends its text).
 *     «پیشنهاد قیمت» is BUYER-only and HIDDEN until OFR-004 (Phase 6) ships
 *     the pre-filled offer sheet — see QUICK_ACTIONS_BY_ROLE.
 * - Visibility: expanded ONLY before MY first non-SYSTEM message exists in
 *   the thread (hasOwnUserMessage); afterwards the row collapses into a «…»
 *   overflow chip that toggles the same row back open. Tapping a chip while
 *   collapsed closes the row again — the sent bubble becomes the outcome.
 * - Unknown role (context loading / missing) renders nothing; sends inherit
 *   the standard send-failure states (failed bubble + retry) from CHT-006.
 */

/** One chip: the visible fa label + the fa template TEXT body it sends. */
export interface QuickAction {
  id: string;
  label: string;
  body: string;
}

/**
 * The fa template constants (card: "constants for fa templates"), keyed by
 * conversation role. OFR-004 scope guard: the buyer's «پیشنهاد قیمت» chip is
 * intentionally ABSENT — per the card it must open the OFR-004 offer sheet
 * pre-filled with the lot context (NOT send a text template), and that sheet
 * does not exist until Phase 6. When OFR-004 lands, re-add the buyer chip
 * with sheet-opening behavior instead of a `body`.
 */
export const QUICK_ACTIONS_BY_ROLE: Record<ConversationRole, QuickAction[]> = {
  buyer: [
    { id: 'ask-price', label: 'قیمت بپرس', body: 'سلام، قیمت نهایی همین قیمت است؟' },
    {
      id: 'more-photos',
      label: 'عکس بیشتری بفرست',
      body: 'لطفاً عکس‌های بیشتری از کالا ارسال کنید.',
    },
    { id: 'send-video', label: 'ویدیو بفرست', body: 'امکان ارسال ویدیو از کالا وجود دارد؟' },
    {
      id: 'arrange-inspection',
      label: 'هماهنگی بازدید',
      body: 'برای هماهنگی بازدید حضوری، وقت مناسب را پیشنهاد دهید.',
    },
  ],
  seller: [
    // Mirrored INFO chips — the seller answers the buyer's typical asks.
    {
      id: 'promise-photos',
      label: 'ارسال عکس بیشتر',
      body: 'به‌زودی عکس‌های بیشتری ارسال می‌کنم.',
    },
    {
      id: 'arrange-inspection',
      label: 'هماهنگی بازدید',
      body: 'برای هماهنگی بازدید حضوری، وقت مناسب را پیشنهاد دهید.',
    },
  ],
};

export interface QuickActionsProps {
  /** Conversation role — picks the chip set (undefined → nothing renders). */
  role: ConversationRole | undefined;
  /** Committed thread history — drives the collapse rule below. */
  messages: MessageResponseDto[];
  /** The current user id — "MY first message" is relative to it. */
  myId: string | undefined;
  /** The CHT-006 optimistic send (use-send-message.send). */
  onSend: (body: string) => void;
}

/** True once the thread contains MY first non-SYSTEM user message. */
export function hasOwnUserMessage(
  messages: MessageResponseDto[],
  myId: string | undefined,
): boolean {
  if (!myId) {
    return false;
  }
  return messages.some(
    (message) =>
      message.type !== 'SYSTEM' && message.senderId !== null && message.senderId === myId,
  );
}

const CHIP_CLASS =
  'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary ' +
  'focus-visible:ring-ring/50 h-10 shrink-0 cursor-pointer whitespace-nowrap rounded-full ' +
  'border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2';

export function QuickActions({ role, messages, myId, onSend }: QuickActionsProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);

  if (!role) {
    return null;
  }

  const collapsed = hasOwnUserMessage(messages, myId);
  const rowVisible = !collapsed || overflowOpen;
  const actions = QUICK_ACTIONS_BY_ROLE[role];

  const pick = (body: string) => {
    onSend(body);
    // Collapsed mode: the tap's purpose is served — hide the row again (the
    // optimistic bubble is now the visible outcome).
    if (collapsed) {
      setOverflowOpen(false);
    }
  };

  return (
    <div
      role="group"
      aria-label="اقدامات سریع"
      // Horizontal chip scroller; the scrollbar is hidden (chips stay swipeable).
      className="flex items-center gap-2 overflow-x-auto px-3 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {collapsed ? (
        <button
          type="button"
          aria-label="نمایش اقدامات سریع"
          aria-expanded={overflowOpen}
          onClick={() => setOverflowOpen((open) => !open)}
          className={`${CHIP_CLASS} w-10 px-0 text-center`}
        >
          …
        </button>
      ) : null}
      {rowVisible
        ? actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => pick(action.body)}
              className={CHIP_CLASS}
            >
              {action.label}
            </button>
          ))
        : null}
    </div>
  );
}
