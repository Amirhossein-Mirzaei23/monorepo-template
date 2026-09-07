/**
 * CHT-001 — shared constants of the conversations module.
 *
 * API language convention (documented on the card): API messages are English
 * machine copy + a machine-readable `code`; the Persian user-facing copy
 * («این لات فعال نیست» …) is rendered web-side from the code. The ONE
 * deliberate exception is the SYSTEM welcome message body — that is CONTENT
 * stored in the DB and shown in the thread, so it is Persian by design.
 */

/** Machine-readable error codes carried on 403/409 bodies (CHT-001). */
export const CONVERSATION_ERROR_CODES = {
  /** Authenticated user without the BUYER hat (403) — mirrors the lots
   * module's SELLER_REQUIRED convention; fa copy lives web-side. */
  BUYER_REQUIRED: 'BUYER_REQUIRED',
  /** The requester IS the lot's seller (403) — one thread per buyer per lot
   * never includes talking to yourself. */
  SELF_CONVERSATION: 'SELF_CONVERSATION',
  /** The lot exists but is not ACTIVE (409) — the card's «این لات فعال نیست»
   * is web-side copy keyed on this code. */
  INACTIVE_LOT: 'INACTIVE_LOT',
} as const;

/**
 * CHT-002 inbox contract — `lastMessagePreview` is truncated to 80 chars.
 * Applied to the welcome message here; CHT-003 reuses the same helper for
 * user messages so list previews never exceed the card's bound.
 */
export const CONVERSATION_PREVIEW_MAX_LENGTH = 80;

/** Truncate to the preview bound, marking the cut with an ellipsis. */
export function truncatePreview(body: string): string {
  if (body.length <= CONVERSATION_PREVIEW_MAX_LENGTH) {
    return body;
  }
  return `${body.slice(0, CONVERSATION_PREVIEW_MAX_LENGTH)}…`;
}

/**
 * The SYSTEM welcome message body stored on conversation creation:
 * «گفتگو درباره: {title} — {unitPrice formatted} تومان». CONTENT copy in fa
 * by design (see the file header) — the price shown is the lot's unitPrice
 * (the derived per-unit comparison price every lot surface leads with).
 * `formatFaNumber` mirrors the web's `formatToman` (apps/web/src/lib/format.ts)
 * so the thread header and this message read the same; the API keeps its own
 * copy because the message is written once, server-side.
 */
const faNumberFormat = new Intl.NumberFormat('fa-IR');

function formatTomanFa(amount: number): string {
  return `${faNumberFormat.format(amount)} تومان`;
}

export function welcomeMessageBody(title: string, unitPrice: number): string {
  return `گفتگو درباره: ${title} — ${formatTomanFa(unitPrice)}`;
}
