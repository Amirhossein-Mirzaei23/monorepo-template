'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Reason-required action dialog (admin panel Task 05) — the admin counterpart
 * of the lots ConfirmDialog with one addition the API contract mandates: a
 * mandatory REASON textarea (the API rejects actions without ≥5 characters).
 * Plain overlay + role="dialog", Escape cancels, focus moves to the input on
 * open, and the confirm stays disabled until the reason is long enough.
 */
export interface UserActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  /** Minimum reason length the API enforces (5 chars). */
  minReasonLength?: number;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function UserActionDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'انصراف',
  danger = false,
  pending = false,
  minReasonLength = 5,
  onConfirm,
  onCancel,
}: UserActionDialogProps) {
  const [reason, setReason] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    // NOTE: no reason reset here — callers mount the dialog only while an
    // action is active, so a fresh mount re-initializes `reason` to '' anyway
    // (setState inside an effect is a lint/react correctness violation).
    reasonRef.current?.focus();
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

  const reasonValid = reason.trim().length >= minReasonLength;

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
        <label htmlFor="admin-user-action-reason" className="mt-3 block text-xs font-medium">
          دلیل (الزامی)
        </label>
        <textarea
          id="admin-user-action-reason"
          ref={reasonRef}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={500}
          className="border-input mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          placeholder="این اقدام در حسابرسی ثبت می‌شود"
        />
        <div className="mt-4 flex gap-2">
          <Button
            variant={danger ? 'destructive' : 'default'}
            className="flex-1"
            disabled={pending || !reasonValid}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? 'در حال انجام…' : confirmLabel}
          </Button>
          <Button variant="outline" className="flex-1" disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
