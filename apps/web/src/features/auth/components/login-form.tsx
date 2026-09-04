'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useLogin } from '../hooks/use-login';
import { loginSchema, type LoginFormData } from '../schemas/login-schema';

/**
 * Reference form pattern (doc/CONVENTIONS.md → Forms / Error Handling):
 * react-hook-form + zod resolver via shadcn form primitives, inline field
 * errors from the schema, mutation failures surfaced as toasts.
 */
export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const login = useLogin();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      toast('خوش آمدید!', 'success');
      // Post-auth destination: the sanitized `?next=` target from the login
      // page, falling back to the dashboard (PLAT-002 route map).
      router.push(redirectTo);
    } catch (error) {
      // Inline field errors already cover validation; anything here is an
      // API/network failure — report via toast, never raw response parsing.
      const message = error instanceof Error ? error.message : 'ورود ناموفق بود';
      toast(message, 'error');
    }
  });

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ایمیل</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>گذرواژه</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting || login.isPending}>
          {login.isPending ? 'در حال ورود…' : 'ورود'}
        </Button>
      </form>
    </Form>
  );
}
