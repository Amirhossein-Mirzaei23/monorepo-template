'use client';

import { useEffect, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CATEGORY_GUARD_ERROR_COPY,
  categoryFormSchema,
  type AdminCategoryTreeNode,
  type CategoryFormData,
  type CategoryWritePayload,
} from '../schemas/categories-schema';

/**
 * Create/edit dialog for the category taxonomy (admin panel Task 06), per the
 * user-action-dialog pattern: plain overlay + role="dialog", Escape cancels,
 * focus moves to the first field on open. One dialog for all three modes —
 * create root, create child (parent fixed to the row), edit (parent movable
 * between top level and any OTHER root; the server re-enforces depth ≤ 2 and
 * slug uniqueness, 409/400 render inline).
 */
export type CategoryFormDialogMode =
  | { kind: 'create-root' }
  | { kind: 'create-child'; parent: AdminCategoryTreeNode }
  | { kind: 'edit'; category: AdminCategoryTreeNode; roots: AdminCategoryTreeNode[] };

export interface CategoryFormDialogProps {
  mode: CategoryFormDialogMode;
  pending: boolean;
  error: unknown;
  onSubmit: (payload: CategoryWritePayload) => void;
  onCancel: () => void;
}

function dialogTitle(mode: CategoryFormDialogMode): string {
  switch (mode.kind) {
    case 'create-root':
      return 'افزودن دستهٔ اصلی';
    case 'create-child':
      return `افزودن زیر‌دسته برای ${mode.parent.nameFa}`;
    case 'edit':
      return `ویرایش ${mode.category.nameFa}`;
  }
}

export function CategoryFormDialog({
  mode,
  pending,
  error,
  onSubmit,
  onCancel,
}: CategoryFormDialogProps) {
  const title = dialogTitle(mode);
  const nameRef = useRef<HTMLInputElement>(null);

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues:
      mode.kind === 'edit'
        ? {
            nameFa: mode.category.nameFa,
            nameEn: mode.category.nameEn ?? '',
            slug: mode.category.slug,
            parentId: mode.category.parentId ?? 'root',
          }
        : { nameFa: '', nameEn: '', slug: '', parentId: 'root' },
  });

  useEffect(() => {
    nameRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const roots = mode.kind === 'edit' ? mode.roots : [];
  const parentFixed = mode.kind === 'create-child';

  // Merge the autofocus ref with react-hook-form's register ref.
  const nameField = form.register('nameFa');

  const submit = form.handleSubmit((values) => {
    onSubmit({
      nameFa: values.nameFa.trim(),
      nameEn: values.nameEn.trim().length > 0 ? values.nameEn.trim() : null,
      slug: values.slug.trim(),
      parentId: parentFixed ? mode.parent.id : values.parentId === 'root' ? null : values.parentId,
    });
  });

  const status = error instanceof ApiError ? error.status : undefined;
  const guardCopy = status !== undefined ? CATEGORY_GUARD_ERROR_COPY[status] : undefined;

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
        className="bg-card relative w-full max-w-md rounded-2xl border p-4 shadow-lg"
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm" htmlFor="category-form-name-fa">
            نام فارسی
            <Input
              id="category-form-name-fa"
              ref={(element) => {
                nameRef.current = element;
                nameField.ref(element);
              }}
              name={nameField.name}
              onChange={nameField.onChange}
              onBlur={nameField.onBlur}
            />
            {form.formState.errors.nameFa?.message && (
              <span role="alert" className="text-destructive text-xs">
                {form.formState.errors.nameFa.message}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm" htmlFor="category-form-name-en">
            نام انگلیسی (اختیاری)
            <Input
              id="category-form-name-en"
              dir="ltr"
              placeholder="Apparel"
              {...form.register('nameEn')}
            />
            {form.formState.errors.nameEn?.message && (
              <span role="alert" className="text-destructive text-xs">
                {form.formState.errors.nameEn.message}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm" htmlFor="category-form-slug">
            اسلاگ
            <Input
              id="category-form-slug"
              dir="ltr"
              placeholder="apparel"
              {...form.register('slug')}
            />
            {form.formState.errors.slug?.message && (
              <span role="alert" className="text-destructive text-xs">
                {form.formState.errors.slug.message}
              </span>
            )}
          </label>

          {parentFixed ? (
            <p className="text-muted-foreground text-xs">والد: {mode.parent.nameFa}</p>
          ) : (
            <label className="flex flex-col gap-1 text-sm" htmlFor="category-form-parent">
              والد
              <select
                id="category-form-parent"
                className="border-input bg-background rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                {...form.register('parentId')}
              >
                <option value="root">سطح اول (بدون والد)</option>
                {roots
                  .filter((root) => mode.kind !== 'edit' || root.id !== mode.category.id)
                  .map((root) => (
                    <option key={root.id} value={root.id}>
                      {root.nameFa}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {guardCopy ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
            >
              {guardCopy}
            </p>
          ) : error ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
            >
              ذخیره ناموفق بود؛ دوباره تلاش کنید.
            </p>
          ) : null}

          <div className="mt-1 flex gap-2">
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? 'در حال ذخیره…' : 'ذخیره'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={pending}
              onClick={onCancel}
            >
              انصراف
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
