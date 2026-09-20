import { z } from 'zod';

export const adminLoginSchema = z.object({
  email: z.string().trim().email('ایمیل معتبر وارد کنید'),
  password: z.string().min(1, 'رمز عبور را وارد کنید'),
});

export type AdminLoginFormData = z.infer<typeof adminLoginSchema>;

export function safeAdminNext(next: string | undefined): string {
  if (!next || !next.startsWith('/admin') || next.startsWith('//') || next.includes('\\')) {
    return '/admin';
  }
  return next === '/admin' || next.startsWith('/admin/') ? next : '/admin';
}
