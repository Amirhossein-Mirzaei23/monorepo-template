'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Minimal accessible sheet (MKT-008) — the repo has no dialog primitive and no
 * @radix-ui/react-dialog dependency, so this is a plain React portal with the
 * dialog mechanics hand-rolled:
 *
 * - `role="dialog"` + `aria-modal` + visible title; focus moves to the panel
 *   on open and returns to the trigger on close.
 * - Focus TRAP: Tab/Shift+Tab cycle within the panel (document-level listener,
 *   so it also works when focus momentarily sits on the overlay/body).
 * - Escape closes; the overlay click closes (overlay is aria-hidden, so the
 *   a11y click-handler rule does not apply — keyboard users have Escape and
 *   the visible close button).
 * - Body scroll locks while open.
 *
 * Presentation follows ui-patterns.md: bottom sheet on mobile (slides up,
 * `rounded-t-2xl`, drag-handle visual), docked sidebar panel on ≥md (slides
 * from the inline-start edge — RTL-aware), so ONE component serves the filter
 * panel on every viewport. Entry animations come from tw-animate-css.
 */
export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Visible heading AND the dialog's accessible name. */
  title: string;
  children: ReactNode;
  /** Sticky footer strip (e.g. apply/reset actions). */
  footer?: ReactNode;
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onOpenChange, title, children, footer, className }: SheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // Latest-callback ref (the radix-dialog pattern): consumers pass inline
  // arrows, and the keydown listener below must NOT re-subscribe (refocusing
  // the panel) on every parent render — its identity is irrelevant to it.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      return;
    }
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onOpenChangeRef.current(false);
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      // Focus trap: wrap Tab at the panel's edges. All sheet content must stay
      // visible while open (no display:none focusables) — the presentation is
      // responsive CSS on the panel itself, never on its controls.
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) {
        return;
      }
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);
      if (event.shiftKey && (!inside || active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  const requestClose = () => onOpenChange(false);

  return createPortal(
    <div className="z-50">
      <div
        aria-hidden="true"
        data-slot="sheet-overlay"
        onClick={requestClose}
        className="fixed inset-0 bg-black/40 animate-in fade-in-0 duration-200"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'bg-background fixed flex flex-col shadow-lg outline-none',
          // Mobile: bottom sheet (ui-patterns.md — rounded-t-2xl, drag handle).
          'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl animate-in slide-in-from-bottom-10 duration-300',
          // ≥md: sidebar panel docked to the inline-start edge.
          'md:inset-y-0 md:end-auto md:start-0 md:h-full md:max-h-none md:w-88 md:rounded-t-none md:rounded-e-2xl md:animate-in md:slide-in-from-start-10',
          className,
        )}
      >
        <div
          aria-hidden="true"
          className="bg-muted mx-auto mt-2 h-1 w-10 shrink-0 rounded-full md:hidden"
        />
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="بستن"
            onClick={requestClose}
            className="text-muted-foreground hover:text-foreground hover:bg-accent grid size-9 place-items-center rounded-full"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="border-t p-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
