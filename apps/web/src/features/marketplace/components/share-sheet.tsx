'use client';

import { useState } from 'react';
import { Link2, MessageCircle, Send } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import {
  buildLotShareText,
  buildLotShareUrl,
  buildTelegramUrl,
  buildWhatsappUrl,
  copyLotLink,
} from '../lib/share';

/**
 * MKT-010 — the share sheet on lot detail (components/ui/sheet.tsx bottom
 * sheet on mobile, start-docked panel on ≥md): کپی لینک with clipboard write +
 * toast, and تلگرام / واتساپ intents prefilled with the fa share text
 * (buildLotShareText) and the absolute /l/{code} URL, opened in a new tab.
 *
 * Error state (card): clipboard denial (or a missing clipboard API — insecure
 * contexts) does NOT fail silently — the URL is revealed in a readonly input,
 * focused and fully selected for one-tap manual copy, with an info toast.
 * A successful copy closes the sheet; the toast is the confirmation.
 *
 * MOUNTED ONLY WHILE OPEN (the FiltersSheet/MKT-008 pattern): the caller
 * renders it inside `{shareOpen ? … : null}`, so every open is a fresh mount
 * and the manual-copy fallback state resets naturally — no close effect.
 */
export interface ShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  title: string;
  unitPrice: number;
  /** fa city label appended to the share text (optional). */
  city?: string | null;
  className?: string;
}

const COPY_TOAST = 'لینک کپی شد';
const MANUAL_TOAST = 'کپی خودکار ممکن نشد — لینک را دستی کپی کنید';

export function ShareSheet({
  open,
  onOpenChange,
  code,
  title,
  unitPrice,
  city,
  className,
}: ShareSheetProps) {
  const { toast } = useToast();
  // Non-null while the manual-copy fallback is shown (clipboard denial).
  // Fresh per open — the sheet mounts only while open (see docblock above).
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  const shareUrl = buildLotShareUrl(code);
  const shareText = buildLotShareText({ title, unitPrice, city });

  const handleCopy = async () => {
    if ((await copyLotLink(code)) === 'copied') {
      toast(COPY_TOAST, 'success');
      onOpenChange(false);
      return;
    }
    setManualUrl(shareUrl);
    toast(MANUAL_TOAST, 'info');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="هم‌رسانی" className={className}>
      <div className="space-y-2 p-4">
        <button
          type="button"
          onClick={() => {
            void handleCopy();
          }}
          className="hover:bg-accent flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-start text-sm font-medium outline-none focus-visible:ring-2"
        >
          <Link2 className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
          کپی لینک
        </button>

        <a
          href={buildTelegramUrl(shareUrl, shareText)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-accent flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none focus-visible:ring-2"
        >
          <Send className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
          تلگرام
        </a>

        <a
          href={buildWhatsappUrl(shareText, shareUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-accent flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none focus-visible:ring-2"
        >
          <MessageCircle className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
          واتساپ
        </a>

        {manualUrl !== null ? (
          <div className="space-y-1 pt-2">
            <label htmlFor="share-manual-url" className="text-muted-foreground text-xs">
              لینک را انتخاب و کپی کنید
            </label>
            <input
              id="share-manual-url"
              ref={(el) => {
                if (el) {
                  el.focus();
                  el.select();
                }
              }}
              readOnly
              value={manualUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="bg-muted h-11 w-full rounded-lg border px-3 font-mono text-xs text-zinc-700 outline-none focus-visible:ring-2"
            />
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
