import type { Metadata } from 'next';
import { AdminCategories } from '@/features/admin';

export const metadata: Metadata = { title: 'دسته‌بندی‌ها' };

/**
 * Admin panel Task 06 — the /admin/categories route. Thin route wrapper: the
 * taxonomy editor lives in features/admin (AdminCategories) and reads its data
 * client-side through the BFF (interactive editor; access token in memory).
 */
export default function AdminCategoriesRoute() {
  return <AdminCategories />;
}
