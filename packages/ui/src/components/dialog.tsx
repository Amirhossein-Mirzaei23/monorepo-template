'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './button';

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
}

/** Modal dialog: focus management, Escape to close, backdrop click, aria-modal. */
export function Dialog({ open, title, onClose, children, closeLabel = 'Close' }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const dialog = dialogRef.current;
    dialog?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    // Backdrop is non-interactive on purpose: closing happens via Escape or the
    // close button (clickable backdrops are an a11y anti-pattern).
    <div className="ui-dialog-backdrop">
      <div
        ref={dialogRef}
        className="ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <h2>{title}</h2>
        {children}
        <div>
          <Button variant="secondary" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
