/**
 * MKT-010 — share builders + actions for the lot detail share sheet.
 *
 * Pure builders (share text, lot URL, Telegram/WhatsApp intents) plus two
 * browser-touching actions (`shareLot`, `copyLotLink`) kept separately so the
 * builders stay trivially unit-testable. Shared copy is the fa template with
 * title + unit price («{title} — {price} | راکدشو {city?}») because Telegram /
 * WhatsApp are the primary buyer channels in Iran (card: Feature #32).
 */
import { formatToman } from '@/lib/format';
import { publicAppUrl } from '@/lib/config';

/** The lot fields the share text/URL are built from. */
export interface LotShareInfo {
  title: string;
  unitPrice: number;
  /** fa city label — optional trailing segment of the share text. */
  city?: string | null;
}

export interface ShareLotInput extends LotShareInfo {
  /** Public lot code — the share URL is /l/{code}. */
  code: string;
}

/** Result of `shareLot` — drives the fallback sheet in lot-detail. */
export type ShareLotOutcome = 'native' | 'sheet';

/** Result of `copyLotLink` — 'manual' means the caller shows the URL for hand-copying. */
export type CopyLinkOutcome = 'copied' | 'manual';

/**
 * The fa share text: `{title} — {formatToman(unitPrice)} | راکدشو {city?}`.
 * Without a city the brand segment is a bare «راکدشو».
 */
export function buildLotShareText({ title, unitPrice, city }: LotShareInfo): string {
  return `${title} — ${formatToman(unitPrice)} | راکدشو${city ? ` ${city}` : ''}`;
}

/**
 * Absolute public URL of /l/{code}: NEXT_PUBLIC_APP_URL when configured,
 * otherwise `window.location.origin` (client-side only). SSR-safe — with no
 * configured origin and no `window` the relative path is returned (the
 * builders are only rendered into client intents/clipboard in practice).
 */
export function buildLotShareUrl(code: string): string {
  if (publicAppUrl) {
    return `${publicAppUrl.replace(/\/+$/, '')}/l/${code}`;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/l/${code}`;
  }
  return `/l/${code}`;
}

/** Telegram intent — prefilled target URL + accompanying fa text. */
export function buildTelegramUrl(url: string, text: string): string {
  return `https://t.me/share/url?${new URLSearchParams({ url, text })}`;
}

/**
 * WhatsApp intent — wa.me only takes a `text` param, so the URL travels
 * appended to the text on its own line.
 */
export function buildWhatsappUrl(text: string, url?: string): string {
  const body = url ? `${text}\n${url}` : text;
  return `https://wa.me/?${new URLSearchParams({ text: body })}`;
}

/**
 * Native share when the platform offers it (mobile Safari/Chrome), else the
 * caller opens the fallback sheet. A dismissed/failed native share (user
 * cancel — AbortError) still resolves 'native': the user already saw the
 * native UI, so the sheet must not stack on top of it.
 */
export async function shareLot(input: ShareLotInput): Promise<ShareLotOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: input.title,
        text: buildLotShareText(input),
        url: buildLotShareUrl(input.code),
      });
    } catch {
      // Dismissal or transport failure of the NATIVE sheet — see docstring.
    }
    return 'native';
  }
  return 'sheet';
}

/**
 * Clipboard write of the lot URL. Permission denial, insecure context or a
 * missing clipboard API resolve 'manual' — the sheet then shows the URL in a
 * readonly input selected for hand-copying (card error state).
 */
export async function copyLotLink(code: string): Promise<CopyLinkOutcome> {
  const url = buildLotShareUrl(code);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      return 'copied';
    }
  } catch {
    // NotAllowedError (denied) or write failure → manual fallback below.
  }
  return 'manual';
}
