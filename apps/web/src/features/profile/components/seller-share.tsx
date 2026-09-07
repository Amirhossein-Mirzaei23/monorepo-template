'use client';

import { useState } from 'react';
import { Link2, MessageCircle, Send, Share2 } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import {
  buildSellerShareText,
  buildSellerShareUrl,
  buildTelegramUrl,
  buildWhatsappUrl,
  copySellerLink,
  shareSeller,
  type SellerShareInfo,
} from '@/features/marketplace';

/**
 * PROF-002 — the seller page share action: the MKT-010 shareLot mechanics
 * (native share when available, else the fallback bottom sheet with کپی لینک /
 * تلگرام / واتساپ) re-run on the /s/{id} URL with the seller fa text
 * (buildSellerShareText — no price segment; a seller page has no single
 * price). The report action the card also lists is deliberately OMITTED until
 * TRS-004 lands reports.
 *
 * MOUNTED ONLY WHILE OPEN (the MKT-010 sheet pattern): every open is a fresh
 * mount, so the manual-copy fallback state resets naturally.
 */

const COPY_TOAST = 'لینک کپی شد';
const MANUAL_TOAST = 'کپی خودکار ممکن نشد — لینک را دستی کپی کنید';

export interface SellerShareButtonProps extends SellerShareInfo {
  /** Profile id — builds the /s/{id} share URL. */
  id: string;
  className?: string;
}

export function SellerShareButton({ id, name, city, className }: SellerShareButtonProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleShare = () => {
    void shareSeller({ id, name, city }).then((outcome) => {
      if (outcome === 'sheet') {
        setSheetOpen(true);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleShare}
        aria-label="هم‌رسانی پروفایل فروشنده"
        className={
          className ??
          'border-border text-foreground hover:bg-accent inline-flex size-11 items-center justify-center rounded-full border'
        }
      >
        <Share2 className="size-5" aria-hidden="true" />
      </button>
      {sheetOpen ? (
        <SellerShareSheet
          open
          onOpenChange={(next) => setSheetOpen(next)}
          id={id}
          name={name}
          city={city}
        />
      ) : null}
    </>
  );
}

export interface SellerShareSheetProps extends SellerShareInfo {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The fallback sheet (no Web Share API): کپی لینک with clipboard write + toast,
 * and تلگرام / واتساپ intents prefilled with the seller fa text + the absolute
 * /s/{id} URL. Clipboard denial reveals the URL in a selected readonly input
 * for hand-copying — exactly the MKT-010 error state, seller-flavored.
 */
export function SellerShareSheet({ open, onOpenChange, id, name, city }: SellerShareSheetProps) {
  const { toast } = useToast();
  // Non-null while the manual-copy fallback is shown (clipboard denial).
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  const shareUrl = buildSellerShareUrl(id);
  const shareText = buildSellerShareText({ name, city });

  const handleCopy = async () => {
    if ((await copySellerLink(id)) === 'copied') {
      toast(COPY_TOAST, 'success');
      onOpenChange(false);
      return;
    }
    setManualUrl(shareUrl);
    toast(MANUAL_TOAST, 'info');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="هم‌رسانی">
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
            <label htmlFor="seller-share-manual-url" className="text-muted-foreground text-xs">
              لینک را انتخاب و کپی کنید
            </label>
            <input
              id="seller-share-manual-url"
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
