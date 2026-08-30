'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useLogin } from '../hooks/use-login';
import { loginSchema, type LoginFormData } from '../schemas/login-schema';

/**
 * Reference form pattern (doc/CONVENTIONS.md → Forms / Error Handling):
 * react-hook-form + zod resolver, inline field errors from the schema,
 * mutation failures surfaced as toasts.
 */
export function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const login = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      toast('Welcome back!', 'success');
      router.push('/dashboard');
    } catch (error) {
      // Inline field errors already cover validation; anything here is an
      // API/network failure — report via toast, never raw response parsing.
      const message = error instanceof Error ? error.message : 'Login failed';
      toast(message, 'error');
    }
  });

  return (
    <form className="login-form" onSubmit={onSubmit} noValidate>
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" disabled={isSubmitting || login.isPending}>
        {login.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
