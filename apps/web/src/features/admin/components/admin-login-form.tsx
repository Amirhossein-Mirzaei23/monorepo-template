'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { useAdminLogin } from '../hooks/use-admin-login';
import {
  adminLoginSchema,
  safeAdminNext,
  type AdminLoginFormData,
} from '../schemas/admin-login-schema';

export function AdminLoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const mutation = useAdminLogin();
  const form = useForm<AdminLoginFormData>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
      router.replace(safeAdminNext(next));
    } catch {
      // Keep credential failures deliberately generic; do not expose API details.
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="ورود مدیر">
      <label className="flex flex-col gap-2 text-sm" htmlFor="admin-email">
        ایمیل
        <Input
          id="admin-email"
          type="email"
          dir="ltr"
          autoComplete="email"
          {...form.register('email')}
        />
        {form.formState.errors.email?.message && (
          <span role="alert">{form.formState.errors.email.message}</span>
        )}
      </label>
      <label className="flex flex-col gap-2 text-sm" htmlFor="admin-password">
        رمز عبور
        <Input
          id="admin-password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          {...form.register('password')}
        />
        {form.formState.errors.password?.message && (
          <span role="alert">{form.formState.errors.password.message}</span>
        )}
      </label>
      {mutation.isError && (
        <p role="alert" className="text-destructive text-sm">
          {mutation.error instanceof ApiError && mutation.error.status === 401
            ? 'ایمیل یا رمز عبور نادرست است.'
            : 'ورود انجام نشد؛ دوباره تلاش کنید.'}
        </p>
      )}
      <Button type="submit" disabled={mutation.isPending} className="min-h-11">
        {mutation.isPending ? 'در حال ورود…' : 'ورود'}
      </Button>
    </form>
  );
}

export { AdminLoginForm as LoginForm };
