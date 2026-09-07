/**
 * CHT-001 — shared constants of the conversations module.
 *
 * API language convention (documented on the card): API messages are English
 * machine copy + a machine-readable `code`; the Persian user-facing copy
 * («این لات فعال نیست» …) is rendered web-side from the code. The ONE
 * deliberate exception is the SYSTEM welcome message body — that is CONTENT
 * stored in the DB and shown in the thread, so it is Persian by design.
 */

import { MessageType } from '@prisma/client';

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
 * CHT-003 — machine-readable error codes carried on 403/400 bodies. Persian
 * user-facing copy is web-side (same discipline as CONVERSATION_ERROR_CODES).
 * CHT-007 adds the media-send codes (documented on the card: TEXT requires
 * body; IMAGE/VIDEO require an OWN mediaAssetId whose type matches; the asset
 * is NOT idempotently probeable — missing and foreign answer uniformly 403
 * like MEDIA-005's gallery validation).
 */
export const MESSAGE_ERROR_CODES = {
  /** Known conversation the requester takes no side of (403). The card pins
   * 404 for UNKNOWN conversations and 403 for known-but-foreign ones — that
   * does leak existence by id, accepted deliberately: ids are unguessable
   * cuids, never sequential (documented on the card). */
  NOT_PARTICIPANT: 'NOT_PARTICIPANT',
  /** Conversation status BLOCKED (403) — no side can send (CHT-009 sets it). */
  CONVERSATION_BLOCKED: 'CONVERSATION_BLOCKED',
  /** `before` is not a message of THIS conversation (400) — a foreign/garbage
   * cursor is a client bug, not a probeable resource. */
  INVALID_CURSOR: 'INVALID_CURSOR',
  /** TEXT send without a 1..2000 body (400, CHT-007). */
  MESSAGE_BODY_REQUIRED: 'MESSAGE_BODY_REQUIRED',
  /** TEXT send carrying a mediaAssetId (400, CHT-007 — media ids are only
   * valid with the matching IMAGE/VIDEO type). */
  MEDIA_ASSET_WITH_TEXT: 'MEDIA_ASSET_WITH_TEXT',
  /** IMAGE/VIDEO send without mediaAssetId (400, CHT-007). */
  MEDIA_ASSET_REQUIRED: 'MEDIA_ASSET_REQUIRED',
  /** IMAGE/VIDEO send carrying a non-empty body (400, CHT-007 — media rows
   * are body-less by contract). */
  MEDIA_BODY_FORBIDDEN: 'MEDIA_BODY_FORBIDDEN',
  /** mediaAssetId does not resolve to a row owned by the sender (403) —
   * missing and foreign are deliberately uniform (no existence oracle for
   * unguessable asset ids; MEDIA-005's documented precedent). */
  MEDIA_NOT_OWNED: 'MEDIA_NOT_OWNED',
  /** The owned asset's MediaType does not match the message type (400) —
   * an IMAGE message cannot carry a VIDEO asset and vice versa. */
  MEDIA_TYPE_MISMATCH: 'MEDIA_TYPE_MISMATCH',
} as const;

/** Hard cap of a TEXT message body (post-trim characters) — CHT-003 card. */
export const MESSAGE_BODY_MAX_LENGTH = 2000;

/**
 * Per-route throttle on `POST /conversations/:id/messages` (card CHT-003:
 * 30/min/user). Mirrors OTP_REQUEST_THROTTLE: static values feeding the
 * `@Throttle` decorator (evaluated once at boot). The global ThrottlerGuard
 * tracks by client IP (X-Forwarded-For behind the proxy) — the per-user card
 * wording is enforced through the authenticated-session-IP tracker, the same
 * approximation every other throttled route in this app uses.
 */
export const MESSAGE_SEND_THROTTLE = {
  limit: 30,
  ttlMs: 60_000,
} as const;

/** Chat-history page size (CHT-003): default 30, hard cap 50. */
export const MESSAGES_DEFAULT_LIMIT = 30;
export const MESSAGES_MAX_LIMIT = 50;

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

/**
 * CHT-007 — the stored inbox preview for MEDIA messages. Media rows are
 * body-less by contract, so the conversation's lastMessagePreview carries a
 * Persian placeholder instead (CONTENT copy in fa by design — the same
 * exception as the SYSTEM welcome above; documented on the card).
 */
export function mediaMessagePreview(type: MessageType): string {
  return type === MessageType.IMAGE ? '📷 تصویر' : '🎬 ویدیو';
}
