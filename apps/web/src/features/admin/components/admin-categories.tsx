'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, RotateCcw } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { formatFaDigits } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  useAdminCategories,
  useCreateCategory,
  useReorderCategory,
  useUpdateCategory,
} from '../hooks/use-admin-categories';
import type { AdminCategoryTreeNode, CategoryWritePayload } from '../schemas/categories-schema';
import { CategoryFormDialog, type CategoryFormDialogMode } from './category-form-dialog';
import { CategoryToggleDialog } from './category-toggle-dialog';

/**
 * «دسته‌بندی‌ها» (admin panel Task 06) — the two-level taxonomy editor over
 * GET /admin/categories. Inactive rows are visible and manageable HERE only;
 * every write goes through the existing admin endpoints (create / update /
 * sibling-swap reorder) and invalidates both the admin tree and the public
 * categories queries (Task 06 step 6). Up/down controls swap sortOrder with
 * the adjacent sibling (the API's only reorder mechanic — no drag-and-drop);
 * there is deliberately no hard delete: the always-visible safety note
 * explains that deactivation keeps historical lots linked.
 */

type DialogState =
  | { kind: 'create-root' }
  | { kind: 'create-child'; parent: AdminCategoryTreeNode }
  | { kind: 'edit'; category: AdminCategoryTreeNode }
  | { kind: 'toggle'; category: AdminCategoryTreeNode };

interface RowActionsProps {
  node: AdminCategoryTreeNode;
  siblings: AdminCategoryTreeNode[];
  depth: 0 | 1;
  reorderPending: boolean;
  onToggle: (node: AdminCategoryTreeNode) => void;
  onEdit: (node: AdminCategoryTreeNode) => void;
  onAddChild: (node: AdminCategoryTreeNode) => void;
  onMove: (node: AdminCategoryTreeNode, sibling: AdminCategoryTreeNode) => void;
}

function CategoryRowActions({
  node,
  siblings,
  depth,
  reorderPending,
  onToggle,
  onEdit,
  onAddChild,
  onMove,
}: RowActionsProps) {
  const index = siblings.findIndex((sibling) => sibling.id === node.id);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;

  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
      {depth === 0 ? (
        <Button
          variant="outline"
          size="sm"
          disabled={reorderPending}
          onClick={() => onAddChild(node)}
        >
          <Plus className="size-4" aria-hidden="true" />
          افزودن زیر‌دسته برای {node.nameFa}
        </Button>
      ) : null}
      <Button variant="outline" size="sm" onClick={() => onEdit(node)}>
        <Pencil className="size-4" aria-hidden="true" />
        ویرایش {node.nameFa}
      </Button>
      <Button
        variant={node.isActive ? 'ghost' : 'secondary'}
        size="sm"
        onClick={() => onToggle(node)}
      >
        {node.isActive ? `غیرفعال‌سازی ${node.nameFa}` : `فعال‌سازی ${node.nameFa}`}
      </Button>
      <span className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          disabled={reorderPending || previous === undefined}
          aria-label={`انتقال ${node.nameFa} به بالا`}
          onClick={() => previous !== undefined && onMove(node, previous)}
        >
          <ChevronUp className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={reorderPending || next === undefined}
          aria-label={`انتقال ${node.nameFa} به پایین`}
          onClick={() => next !== undefined && onMove(node, next)}
        >
          <ChevronDown className="size-4" aria-hidden="true" />
        </Button>
      </span>
    </span>
  );
}

function CategoryCounters({ node }: { node: AdminCategoryTreeNode }) {
  return (
    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
      لات‌ها: {formatFaDigits(node.directLotCount)}{' '}
      <span>(نمایان: {formatFaDigits(node.visibleLotCount)})</span>
    </span>
  );
}

function CategoryRow({
  node,
  siblings,
  depth,
  reorderPending,
  onToggle,
  onEdit,
  onAddChild,
  onMove,
}: Omit<RowActionsProps, 'depth'> & { depth: 0 | 1 }) {
  return (
    <li data-testid={`admin-category-row-${node.slug}`}>
      <div
        className={
          depth === 0
            ? 'rounded-lg border bg-white px-3 py-3'
            : 'rounded-lg border border-dashed px-3 py-2 md:ms-6'
        }
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
          <span className="grid min-w-0 gap-0.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              {node.nameFa}
              {node.nameEn ? (
                <span dir="ltr" className="text-muted-foreground text-xs">
                  {node.nameEn}
                </span>
              ) : null}
              <span
                className={
                  node.isActive
                    ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
                    : 'rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700'
                }
              >
                {node.isActive ? 'فعال' : 'غیرفعال'}
              </span>
            </span>
            <span dir="ltr" className="text-muted-foreground text-xs">
              /{node.slug}
            </span>
          </span>
          <CategoryCounters node={node} />
          <CategoryRowActions
            node={node}
            siblings={siblings}
            depth={depth}
            reorderPending={reorderPending}
            onToggle={onToggle}
            onEdit={onEdit}
            onAddChild={onAddChild}
            onMove={onMove}
          />
        </div>
        {node.children.length > 0 ? (
          <ul className="mt-2 grid gap-2 border-t border-dashed pt-2">
            {node.children.map((child) => (
              <CategoryRow
                key={child.id}
                node={child}
                siblings={node.children}
                depth={1}
                reorderPending={reorderPending}
                onToggle={onToggle}
                onEdit={onEdit}
                onAddChild={onAddChild}
                onMove={onMove}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

export function AdminCategories() {
  const tree = useAdminCategories();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const reorder = useReorderCategory();
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const writePending = create.isPending || update.isPending;

  const submitCreate = (payload: CategoryWritePayload) => {
    if (dialog?.kind !== 'create-root' && dialog?.kind !== 'create-child') {
      return;
    }
    create.mutate(payload, { onSuccess: () => setDialog(null) });
  };

  const submitEdit = (payload: CategoryWritePayload) => {
    if (dialog?.kind !== 'edit') {
      return;
    }
    update.mutate({ id: dialog.category.id, payload }, { onSuccess: () => setDialog(null) });
  };

  const submitToggle = (category: AdminCategoryTreeNode) => {
    update.mutate(
      { id: category.id, payload: { isActive: !category.isActive } },
      { onSuccess: () => setDialog(null) },
    );
  };

  const move = (node: AdminCategoryTreeNode, sibling: AdminCategoryTreeNode) => {
    reorder.mutate({ id: node.id, siblingId: sibling.id });
  };

  const roots = tree.data ?? [];
  const formMode: CategoryFormDialogMode | null =
    dialog?.kind === 'create-root'
      ? { kind: 'create-root' }
      : dialog?.kind === 'create-child'
        ? { kind: 'create-child', parent: dialog.parent }
        : dialog?.kind === 'edit'
          ? { kind: 'edit', category: dialog.category, roots }
          : null;
  const formError = dialog?.kind === 'edit' ? update.error : create.error;
  const formPending = dialog?.kind === 'edit' ? update.isPending : create.isPending;

  return (
    <section aria-labelledby="admin-categories-title" className="grid gap-4">
      <header>
        <h2 id="admin-categories-title" className="text-2xl font-semibold">
          دسته‌بندی‌ها
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          ویرایشگر درخت دو‌سطحی دسته‌بندی‌ها — ردیف‌های غیرفعال فقط همین‌جا قابل مدیریت‌اند.
        </p>
      </header>

      <p
        data-testid="admin-categories-safety"
        className="rounded-lg bg-sky-50 px-3 py-2 text-xs leading-6 text-sky-900"
      >
        حذف قطعی وجود ندارد: غیرفعال‌سازی یک دسته آن را از فروشگاه پنهان می‌کند، اما لات‌های تاریخی
        همچنان به آن متصل می‌مانند. شمارنده‌ها فقط برای اطلاع‌اند و اجازهٔ حذفی نمی‌دهند.
      </p>

      <div>
        <Button onClick={() => setDialog({ kind: 'create-root' })}>
          <Plus className="size-4" aria-hidden="true" />
          افزودن دستهٔ اصلی
        </Button>
      </div>

      {reorder.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {reorder.error instanceof ApiError && reorder.error.status === 400
            ? 'جابه‌جایی فقط بین دو هم‌گروه (فرزندان یک والد یا دو دستهٔ سطح اول) ممکن است.'
            : 'جابه‌جایی انجام نشد؛ دوباره تلاش کنید.'}
        </p>
      ) : null}

      {tree.isLoading ? (
        <div role="status" aria-label="در حال بارگذاری دسته‌بندی‌ها" className="grid gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-lg bg-zinc-200" />
          ))}
        </div>
      ) : tree.isError ? (
        <Card className="grid gap-3 px-6 py-6 text-center" data-testid="admin-categories-error">
          <p className="text-sm font-medium">دریافت درخت دسته‌بندی‌ها ناموفق بود</p>
          <p className="text-muted-foreground text-xs">
            اتصال خود را بررسی کنید و دوباره تلاش کنید.
          </p>
          <Button variant="outline" className="mx-auto" onClick={() => void tree.refetch()}>
            <RotateCcw className="size-4" aria-hidden="true" />
            تلاش مجدد
          </Button>
        </Card>
      ) : tree.data === undefined ? null : roots.length === 0 ? (
        <Card className="grid gap-2 px-8 py-8 text-center" data-testid="admin-categories-empty">
          <p className="text-sm font-medium">هنوز دسته‌ای ثبت نشده است</p>
          <p className="text-muted-foreground text-xs">با «افزودن دستهٔ اصلی» شروع کنید.</p>
        </Card>
      ) : (
        <ul className="grid gap-3" data-testid="admin-categories-tree">
          {roots.map((root) => (
            <CategoryRow
              key={root.id}
              node={root}
              siblings={roots}
              depth={0}
              reorderPending={reorder.isPending}
              onToggle={(node) => setDialog({ kind: 'toggle', category: node })}
              onEdit={(node) => setDialog({ kind: 'edit', category: node })}
              onAddChild={(node) => setDialog({ kind: 'create-child', parent: node })}
              onMove={move}
            />
          ))}
        </ul>
      )}

      {formMode !== null ? (
        <CategoryFormDialog
          mode={formMode}
          pending={formPending}
          error={formError}
          onSubmit={(payload) =>
            dialog?.kind === 'edit' ? submitEdit(payload) : submitCreate(payload)
          }
          onCancel={() => {
            create.reset();
            update.reset();
            setDialog(null);
          }}
        />
      ) : null}

      {dialog?.kind === 'toggle' ? (
        <CategoryToggleDialog
          category={dialog.category}
          pending={writePending}
          onConfirm={() => submitToggle(dialog.category)}
          onCancel={() => {
            update.reset();
            setDialog(null);
          }}
        />
      ) : null}
    </section>
  );
}
