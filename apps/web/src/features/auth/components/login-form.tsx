'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api-client';
import { formatFaDigits } from '@/lib/format';
import { useOtpRequest } from '../hooks/use-otp-request';
import { useOtpVerify } from '../hooks/use-otp-verify';
import {
  otpRequestSchema,
  otpVerifySchema,
  toEnglishDigits,
  type OtpRequestFormData,
  type OtpVerifyFormData,
} from '../schemas/otp-schema';

/** Resend cooldown (seconds) — mirrors the OTP code lifetime (AUTH-002). */
const RESEND_COUNTDOWN_SECONDS = 120;
const CODE_LENGTH = 6;

/** Masks the middle digits of an 11-digit phone: 09121234567 → «۰۹۱۲•••۴۵۶۷». */
function maskPhone(phone: string): string {
  return formatFaDigits(`${phone.slice(0, 4)}•••${phone.slice(7)}`);
}

function tooManyRequestsText(retryAfterSeconds: number | undefined): string {
  const base = 'درخواست‌های شما بیش از حد مجاز بوده است';
  return retryAfterSeconds && retryAfterSeconds > 0
    ? `${base}؛ ${formatFaDigits(retryAfterSeconds)} ثانیه دیگر تلاش کنید.`
    : `${base}؛ کمی بعد دوباره تلاش کنید.`;
}

function networkErrorText(): string {
  return 'برقراری ارتباط با سرور ممکن نشد؛ اتصال خود را بررسی و دوباره تلاش کنید.';
}

/** Maps a request-step failure to a Persian toast message. */
function requestErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return networkErrorText();
    if (error.status === 429) return tooManyRequestsText(error.body?.retryAfterSeconds);
    if (error.status === 503) return 'ارسال پیامک با اختلال مواجه است؛ لطفاً کمی بعد تلاش کنید.';
  }
  return 'درخواست کد ورود ناموفق بود؛ دوباره تلاش کنید.';
}

/** Maps a 403 account-status code to a Persian message (ACCOUNT_* family). */
function statusErrorText(code: string | undefined): string {
  switch (code) {
    case 'ACCOUNT_SUSPENDED':
      return 'حساب شما موقتاً غیرفعال شده است؛ برای پیگیری با پشتیبانی تماس بگیرید.';
    case 'ACCOUNT_BLOCKED':
      return 'دسترسی این حساب مسدود شده است.';
    case 'ACCOUNT_DELETED':
      return 'این حساب حذف شده است.';
    default:
      return 'ورود برای این حساب مجاز نیست.';
  }
}

/**
 * Persian two-step OTP login (AUTH-004): phone → SMS code. All server calls
 * go through the feature's TanStack Query mutations (useOtpRequest /
 * useOtpVerify); the form only owns step state, the resend countdown and
 * error presentation (inline zod errors + toasts, per doc/CONVENTIONS.md).
 */
export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const requestMutation = useOtpRequest();
  const verifyMutation = useOtpVerify();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>(undefined);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const phoneForm = useForm<OtpRequestFormData>({
    resolver: zodResolver(otpRequestSchema),
    defaultValues: { phone: '' },
  });
  const codeForm = useForm<OtpVerifyFormData>({
    resolver: zodResolver(otpVerifySchema),
    defaultValues: { code: '' },
  });

  const codeInputRef = useRef<HTMLInputElement | null>(null);
  /** The code value last sent (auto-submit loop guard; null after clearing). */
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  /** Bumped to (re)focus the code input — refs are only touched inside effects. */
  const [codeFocusTick, setCodeFocusTick] = useState(0);

  // Resend countdown — one 1 Hz interval while active.
  const counting = secondsLeft > 0;
  useEffect(() => {
    if (!counting) {
      return;
    }
    const timer = setInterval(() => setSecondsLeft((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  useEffect(() => {
    if (codeFocusTick > 0) {
      codeInputRef.current?.focus();
    }
  }, [codeFocusTick]);

  /** Requests a code for `phone`; on success restarts the countdown. */
  const requestCode = useCallback(
    async (normalizedPhone: string): Promise<boolean> => {
      try {
        const response = await requestMutation.mutateAsync(normalizedPhone);
        setDevCode(response.devCode);
        setSecondsLeft(RESEND_COUNTDOWN_SECONDS);
        toast('کد ورود برای شما پیامک شد', 'success');
        return true;
      } catch (error) {
        toast(requestErrorText(error), 'error');
        return false;
      }
    },
    [requestMutation, toast],
  );

  /** Presents a verify failure: 401 inline (input cleared), the rest as toasts. */
  const applyVerifyError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError) {
        if (error.status === 0) {
          toast(networkErrorText(), 'error');
          return;
        }
        if (error.status === 429) {
          toast(tooManyRequestsText(error.body?.retryAfterSeconds), 'error');
          return;
        }
        if (error.status === 403) {
          toast(statusErrorText(error.body?.code), 'error');
          return;
        }
        if (error.status === 503) {
          toast('خطای سرویس پیامک؛ لطفاً کمی بعد تلاش کنید.', 'error');
          return;
        }
        if (error.status === 401) {
          const locked = error.body?.code === 'LOCKED';
          codeForm.setValue('code', '');
          setSubmittedCode(null);
          codeForm.setError('code', {
            type: 'manual',
            message: locked
              ? 'تلاش‌های ناموفق بیش از حد مجاز است؛ لطفاً کد جدید درخواست کنید'
              : 'کد واردشده صحیح نیست؛ دوباره تلاش کنید',
          });
          setCodeFocusTick((tick) => tick + 1);
          return;
        }
      }
      toast('ورود ناموفق بود؛ دوباره تلاش کنید.', 'error');
    },
    [codeForm, toast],
  );

  const submitCode = useCallback(
    async (code: string) => {
      try {
        const session = await verifyMutation.mutateAsync({ phone, code });
        toast('خوش آمدید!', 'success');
        // Route onboarding-aware: the flag is a server-side placeholder (true)
        // until ONB-001 lands the real profile check.
        router.push(session.onboardingCompleted ? redirectTo : '/onboarding');
      } catch (error) {
        applyVerifyError(error);
      }
    },
    [applyVerifyError, phone, redirectTo, router, toast, verifyMutation],
  );

  const onPhoneSubmit = phoneForm.handleSubmit(async (values) => {
    // The zod resolver normalizes fa digits before they reach us.
    const requested = await requestCode(values.phone);
    if (requested) {
      setPhone(values.phone);
      codeForm.reset({ code: '' });
      setSubmittedCode(null);
      setStep('code');
      setCodeFocusTick((tick) => tick + 1);
    }
  });

  const onCodeSubmit = codeForm.handleSubmit((values) => {
    const code = toEnglishDigits(values.code);
    setSubmittedCode(code);
    void submitCode(code);
  });

  const resendCode = async () => {
    const requested = await requestCode(phone);
    if (requested) {
      setCodeFocusTick((tick) => tick + 1);
    }
  };

  const editPhone = () => {
    setStep('phone');
    codeForm.reset({ code: '' });
    setSubmittedCode(null);
    setDevCode(undefined);
  };

  if (step === 'phone') {
    return (
      <Form {...phoneForm}>
        <form className="flex flex-col gap-4" onSubmit={onPhoneSubmit} noValidate>
          <FormField
            control={phoneForm.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>شماره موبایل</FormLabel>
                <FormControl>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    dir="ltr"
                    placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                    className="h-11 text-center text-lg tracking-widest"
                    {...field}
                    onChange={(event) =>
                      field.onChange(toEnglishDigits(event.target.value).slice(0, 11))
                    }
                  />
                </FormControl>
                <FormDescription>شماره با فرمت ۰۹XXXXXXXXX وارد شود</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            className="h-11"
            disabled={phoneForm.formState.isSubmitting || requestMutation.isPending}
          >
            {requestMutation.isPending ? 'در حال ارسال…' : 'دریافت کد ورود'}
          </Button>
        </form>
      </Form>
    );
  }

  return (
    <Form {...codeForm}>
      <form className="flex flex-col gap-4" onSubmit={onCodeSubmit} noValidate>
        <div className="flex flex-col gap-1">
          <p className="text-sm">
            کد تأیید به شماره{' '}
            <span dir="ltr" className="text-foreground font-medium">
              {maskPhone(phone)}
            </span>{' '}
            پیامک شد.
          </p>
          <Button type="button" variant="link" className="h-9 self-start px-0" onClick={editPhone}>
            ویرایش شماره
          </Button>
        </div>

        {devCode !== undefined && (
          <div
            role="status"
            className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40"
          >
            <span>
              حالت توسعه فعال است — کد ورود:{' '}
              <code dir="ltr" className="font-mono font-semibold">
                {devCode}
              </code>
            </span>
            <button
              type="button"
              aria-label="بستن راهنمای کد توسعه"
              className="min-h-8 cursor-pointer rounded-md px-2 text-lg leading-none hover:bg-amber-100 dark:hover:bg-amber-900/60"
              onClick={() => setDevCode(undefined)}
            >
              ×
            </button>
          </div>
        )}

        <FormField
          control={codeForm.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>کد تأیید</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  dir="ltr"
                  maxLength={CODE_LENGTH}
                  className="-me-[0.5em] h-12 text-center text-xl tracking-[0.5em]"
                  {...field}
                  ref={(element) => {
                    // RHF composes the callback ref; ours only focuses.
                    field.ref(element);
                    codeInputRef.current = element;
                  }}
                  onChange={(event) => {
                    const next = toEnglishDigits(event.target.value).slice(0, CODE_LENGTH);
                    field.onChange(next);
                    // Auto-submit once the code is complete (mobile: type 6
                    // digits, no tap). Guarded so pending/duplicate values and
                    // error-path retries never double-fire.
                    if (
                      next.length === CODE_LENGTH &&
                      !verifyMutation.isPending &&
                      submittedCode !== next
                    ) {
                      setSubmittedCode(next);
                      void submitCode(next);
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="h-11" disabled={verifyMutation.isPending}>
          {verifyMutation.isPending ? 'در حال بررسی…' : 'تأیید و ورود'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={counting || requestMutation.isPending}
          onClick={resendCode}
        >
          {requestMutation.isPending
            ? 'در حال ارسال…'
            : counting
              ? `ارسال مجدد کد تا ${formatFaDigits(secondsLeft)} ثانیه دیگر`
              : 'ارسال مجدد کد'}
        </Button>
      </form>
    </Form>
  );
}
