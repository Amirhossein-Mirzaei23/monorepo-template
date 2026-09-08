'use client';

import { useState } from 'react';
import type { ConversationRole, MessageResponseDto } from '@monorepo/shared-types';

/**
 * CHT-008 — contextual quick-action chips above the composer (the card's
 * "structured negotiation starters without over-engineering chat").
 *
 * - Every chip sends its fa template as a NORMAL TEXT message through the
 *   CHT-006 optimistic send flow (`onSend` → use-send-message) — no new
 *   message kind. Architectural note: `MessageType.ACTION` stays RESERVED for
 *   the API-written offer events (OFR-002 posts them into the thread; the
 *   thread renders them as offer chain cards — OFR-004's OfferActionBubble).
 * - Role mapping (the card's "buyer-side chips; seller sees mirrored info
 *   chips only"):
 *     buyer  → «پیشنهاد قیمت» (the OFR-004 OFFER SHEET — see below) +
 *             «قیمت بپرس» / «عکس بیشتری بفرست» / «ویدیو بفرست» /
 *             «هماهنگی بازدید» — negotiation REQUEST starters (buyer → seller).
 *     seller → «ارسال عکس بیشتر» (the mirrored PROMISE template) +
 *             «هماهنگی بازدید» (either side may propose a visit slot; the real
 *             inspection workflow is TRS-007 — this chip only sends its text).
 * - «پیشنهاد قیمت» is BUYER-only and does NOT send text: per CHT-008's
 *   documented follow-up it opens the OFR-004 offer sheet pre-filled with the
 *   lot context, through the `onMakeOffer` callback. A surface that does not
 *   wire `onMakeOffer` simply never renders the chip (the CHT-008-era hidden
 *   state, kept as the unwired default — the chip needs a live lot context to
 *   make sense).
 * - Visibility: expanded ONLY before MY first non-SYSTEM message exists in
 *   the thread (hasOwnUserMessage); afterwards the row collapses into a «…»
 *   overflow chip that toggles the same row back open. Tapping a chip while
 *   collapsed closes the row again — the sent bubble / opened sheet becomes
 *   the outcome.
 * - Unknown role (context loading / missing) renders nothing; sends inherit
 *   the standard send-failure states (failed bubble + retry) from CHT-006.
 */

/** One chip: the visible fa label + the fa template TEXT body it sends.
 * `body` is absent for the sheet-opening chip («پیشنهاد قیمت», OFR-004). */
export interface QuickAction {
  id: string;
  label: string;
  body?: string;
}

/** The chip id that opens the OFR-004 offer sheet instead of sending text. */
export const MAKE_OFFER_ACTION_ID = 'make-offer';

/**
 * The fa template constants (card: "constants for fa templates"), keyed by
 * conversation role. The buyer's «پیشنهاد قیمت» chip carries NO body — it
 * opens the OFR-004 offer sheet (pre-filled with the lot context) through the
 * `onMakeOffer` callback; it renders only when that callback is wired.
 */
export const QUICK_ACTIONS_BY_ROLE: Record<ConversationRole, QuickAction[]> = {
  buyer: [
    { id: MAKE_OFFER_ACTION_ID, label: 'پیشنهاد قیمت' },
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
  /**
   * OFR-004 wiring — opening the shared offer sheet with the conversation's
   * lot context. Absent → the buyer's «پیشنهاد قیمت» chip stays hidden.
   */
  onMakeOffer?: () => void;
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

export function QuickActions({ role, messages, myId, onSend, onMakeOffer }: QuickActionsProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);

  if (!role) {
    return null;
  }

  const collapsed = hasOwnUserMessage(messages, myId);
  const rowVisible = !collapsed || overflowOpen;
  const actions = QUICK_ACTIONS_BY_ROLE[role];

  /** The tap's purpose is served — in collapsed mode hide the row again. */
  const settle = () => {
    if (collapsed) {
      setOverflowOpen(false);
    }
  };

  const pick = (action: QuickAction) => {
    if (action.id === MAKE_OFFER_ACTION_ID) {
      // The sheet opener never sends text; only rendered when wired (OFR-004).
      if (onMakeOffer) {
        onMakeOffer();
        settle();
      }
      return;
    }
    if (action.body !== undefined) {
      onSend(action.body);
      settle();
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
        ? actions.map((action) => {
            // Unwired surfaces keep the CHT-008-era hidden state for the
            // sheet-opening chip (it needs a live lot context to make sense).
            if (action.id === MAKE_OFFER_ACTION_ID && !onMakeOffer) {
              return null;
            }
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => pick(action)}
                className={CHIP_CLASS}
              >
                {action.label}
              </button>
            );
          })
        : null}
    </div>
  );
}
