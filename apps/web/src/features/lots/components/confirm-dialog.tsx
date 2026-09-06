'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Minimal confirmation dialog (LOT-005 quick actions) — no external dialog
 * dependency: plain overlay + role="dialog", Escape to cancel, focus moved to
 * the cancel button on open. Persian copy per action comes from the caller.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Danger confirmations (delete) render the destructive variant. */
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'انصراف',
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-4 sm:items-center">
      <button
        type="button"
        aria-label="بستن"
        className="absolute inset-0 cursor-default"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-card relative w-full max-w-sm rounded-2xl border p-4 shadow-lg"
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-6">{description}</p>
        <div className="mt-4 flex gap-2">
          <Button
            variant={danger ? 'destructive' : 'default'}
            className="flex-1"
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button
            ref={cancelRef}
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
