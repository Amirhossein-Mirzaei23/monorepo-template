'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { AdminCategoryTreeNode } from '../schemas/categories-schema';

/**
 * Deactivate/reactivate confirmation for a category (admin panel Task 06),
 * per the user-action-dialog pattern (plain overlay + role="dialog", Escape
 * cancels — no reason field: the categories API takes none). The deactivate
 * copy carries the safety promise: lots keep referencing the row, nothing is
 * deleted — deactivation only hides the category from the public tree.
 */
export interface CategoryToggleDialogProps {
  category: AdminCategoryTreeNode;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CategoryToggleDialog({
  category,
  pending,
  onConfirm,
  onCancel,
}: CategoryToggleDialogProps) {
  const activating = !category.isActive;
  const title = activating ? 'فعال‌سازی دسته' : 'غیرفعال‌سازی دسته';
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

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
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          {activating
            ? `«${category.nameFa}» دوباره در فروشگاه نمایش داده می‌شود و برای انتخاب در ثبت لات در دسترس است.`
            : `«${category.nameFa}» از فروشگاه پنهان می‌شود؛ اما هیچ لاتی حذف نمی‌شود — لات‌های تاریخی همچنان به این دسته متصل می‌مانند.`}
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            ref={confirmRef}
            variant={activating ? 'default' : 'destructive'}
            className="flex-1"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'در حال انجام…' : activating ? 'فعال‌سازی' : 'غیرفعال‌سازی'}
          </Button>
          <Button variant="outline" className="flex-1" disabled={pending} onClick={onCancel}>
            انصراف
          </Button>
        </div>
      </div>
    </div>
  );
}
