'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SaveOnboardingDto } from '@monorepo/shared-types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { formatFaDigits } from '@/lib/format';
import { useCategories } from '../hooks/use-categories';
import { useSaveOnboarding } from '../hooks/use-save-onboarding';
import {
  onboardingFormSchema,
  STEP_FIELDS,
  type OnboardingFormData,
  type OnboardingStepId,
} from '../schemas/onboarding-schema';
import { StepIdentity } from './steps/step-identity';
import { StepInterests } from './steps/step-interests';
import { StepLinks } from './steps/step-links';
import { StepRole } from './steps/step-role';
import { StepSellerExtras } from './steps/step-seller-extras';

const DRAFT_STORAGE_KEY = 'rakdsho:onboarding-draft';
const MAX_INTERESTS = 10;

const STEP_ORDER: readonly OnboardingStepId[] = [
  'role',
  'identity',
  'interests',
  'sellerExtras',
  'links',
];
const SELLER_ONLY_STEPS = 2;

const STEP_TITLES_FA: Record<OnboardingStepId, string> = {
  role: 'نقش شما',
  identity: 'مشخصات',
  interests: 'علاقه‌مندی‌ها',
  sellerExtras: 'اطلاعات فروشندگی',
  links: 'لینک‌های اختیاری',
};

interface WizardDraft {
  step: number;
  data: OnboardingFormData;
}

const EMPTY_FORM: OnboardingFormData = {
  isBuyer: false,
  isSeller: false,
  displayName: '',
  businessName: '',
  province: '',
  city: '',
  instagram: '',
  website: '',
  sellerYearsActive: undefined,
  sellerBusinessType: undefined,
  sellerDescription: '',
  interests: [],
};

/** Seller extras are kept as strings in the form state; convert for the API. */
interface FormState extends Omit<
  OnboardingFormData,
  | 'sellerYearsActive'
  | 'sellerBusinessType'
  | 'displayName'
  | 'businessName'
  | 'province'
  | 'city'
  | 'instagram'
  | 'website'
  | 'sellerDescription'
> {
  sellerYearsActive: string;
  sellerBusinessType: string;
  displayName: string;
  businessName: string;
  province: string;
  city: string;
  instagram: string;
  website: string;
  sellerDescription: string;
}

const EMPTY_FORM_STATE: FormState = {
  ...EMPTY_FORM,
  displayName: '',
  businessName: '',
  province: '',
  city: '',
  instagram: '',
  website: '',
  sellerDescription: '',
  sellerYearsActive: '',
  sellerBusinessType: '',
};

type FieldErrors = Partial<Record<string, string>>;

function loadDraft(): WizardDraft | undefined {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as WizardDraft;
    if (
      typeof parsed.step !== 'number' ||
      typeof parsed.data !== 'object' ||
      parsed.data === null
    ) {
      return undefined;
    }
    return { step: parsed.step, data: { ...EMPTY_FORM, ...parsed.data } };
  } catch {
    return undefined;
  }
}

/** Restore a persisted draft into form state (strings normalized, step clamped). */
function restoreFormState(draft: WizardDraft): { form: FormState; step: number } {
  const restored = draft.data;
  const stepCount = restored.isSeller ? STEP_ORDER.length : STEP_ORDER.length - SELLER_ONLY_STEPS;
  return {
    form: {
      ...EMPTY_FORM_STATE,
      ...restored,
      displayName: restored.displayName ?? '',
      businessName: restored.businessName ?? '',
      province: restored.province ?? '',
      city: restored.city ?? '',
      instagram: restored.instagram ?? '',
      website: restored.website ?? '',
      sellerDescription: restored.sellerDescription ?? '',
      sellerYearsActive:
        restored.sellerYearsActive !== undefined ? String(restored.sellerYearsActive) : '',
      sellerBusinessType: (restored.sellerBusinessType as string | undefined) ?? '',
    },
    step: Math.max(0, Math.min(draft.step, stepCount - 1)),
  };
}

/** Validate one step's slice of the form; returns field → first message. */
function stepErrors(data: OnboardingFormData, step: OnboardingStepId): FieldErrors {
  const result = onboardingFormSchema.safeParse(data);
  if (result.success) {
    return {};
  }
  const fields = STEP_FIELDS[step] as readonly string[];
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    if (fields.includes(field) && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

function toPayload(data: OnboardingFormData): SaveOnboardingDto {
  const payload: SaveOnboardingDto = {
    isBuyer: data.isBuyer,
    isSeller: data.isSeller,
    displayName: data.displayName,
    interests: data.interests,
  };
  if (data.isSeller) {
    if (data.businessName) {
      payload.businessName = data.businessName;
    }
    if (data.sellerYearsActive !== undefined) {
      payload.sellerYearsActive = data.sellerYearsActive;
    }
    if (data.sellerBusinessType) {
      payload.sellerBusinessType = data.sellerBusinessType;
    }
    if (data.sellerDescription) {
      payload.sellerDescription = data.sellerDescription;
    }
  }
  if (data.province && data.city) {
    payload.province = data.province;
    payload.city = data.city;
  }
  if (data.instagram) {
    payload.instagram = data.instagram;
  }
  if (data.website) {
    payload.website = data.website;
  }
  return payload;
}

/** Mobile-first onboarding wizard (ONB-002): role → identity → interests → seller extras → links. */
export function OnboardingWizard({ redirectTo = '/dashboard' }: { redirectTo?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const saveOnboarding = useSaveOnboarding();
  const categories = useCategories();

  const [initialDraft] = useState(() => loadDraft());
  const [restored] = useState(() =>
    initialDraft ? restoreFormState(initialDraft) : { form: EMPTY_FORM_STATE, step: 0 },
  );
  const [form, setForm] = useState<FormState>(restored.form);
  const [stepIndex, setStepIndex] = useState(restored.step);
  const [errors, setErrors] = useState<FieldErrors>({});
  const draftRestored = Boolean(initialDraft);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Buyer path ends after interests (card: skip path for buyers after step 3).
  const steps = useMemo<OnboardingStepId[]>(
    () =>
      STEP_ORDER.filter(
        (stepId) => form.isSeller || (stepId !== 'sellerExtras' && stepId !== 'links'),
      ),
    [form.isSeller],
  );
  const step = steps[Math.min(stepIndex, steps.length - 1)] ?? 'role';
  const isLastStep = steps.indexOf(step) === steps.length - 1;

  // Autosave draft on every change.
  useEffect(() => {
    if (!draftRestored && stepIndex === 0 && form === EMPTY_FORM_STATE) {
      return;
    }
    const data: OnboardingFormData = {
      ...form,
      sellerYearsActive: form.sellerYearsActive === '' ? undefined : Number(form.sellerYearsActive),
      sellerBusinessType:
        form.sellerBusinessType === ''
          ? undefined
          : (form.sellerBusinessType as OnboardingFormData['sellerBusinessType']),
    };
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ step: stepIndex, data }));
    } catch {
      // Storage full/unavailable — drafts are best-effort.
    }
  }, [form, stepIndex, draftRestored]);

  // Focus the step heading on step change (focus management).
  useEffect(() => {
    headingRef.current?.focus();
  }, [stepIndex]);

  const patchForm = useCallback((patch: Partial<FormState>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setErrors((previous) => {
      const next = { ...previous };
      for (const key of Object.keys(patch)) {
        delete next[key];
      }
      return next;
    });
  }, []);

  const formData = useMemo<OnboardingFormData>(
    () => ({
      ...form,
      sellerYearsActive: form.sellerYearsActive === '' ? undefined : Number(form.sellerYearsActive),
      sellerBusinessType:
        form.sellerBusinessType === ''
          ? undefined
          : (form.sellerBusinessType as OnboardingFormData['sellerBusinessType']),
    }),
    [form],
  );

  const submit = useCallback(() => {
    const payload = toPayload(formData);
    saveOnboarding.mutate(payload, {
      onSuccess: () => {
        try {
          window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        } catch {
          // Best-effort clear.
        }
        toast('پروفایل شما ذخیره شد', 'success');
        router.replace(redirectTo);
      },
      onError: () => {
        toast('ذخیره پروفایل ناموفق بود — دوباره تلاش کنید', 'error');
      },
    });
  }, [formData, redirectTo, router, saveOnboarding, toast]);

  const goNext = useCallback(() => {
    const stepValidationError = stepErrors(formData, step);
    setErrors(stepValidationError);
    if (Object.keys(stepValidationError).length > 0) {
      return;
    }
    if (isLastStep) {
      submit();
      return;
    }
    const nextIndex = steps.indexOf(step) + 1;
    setStepIndex(Math.min(nextIndex, steps.length - 1));
  }, [formData, isLastStep, step, steps, submit]);

  const goBack = useCallback(() => {
    setErrors({});
    setStepIndex(Math.max(steps.indexOf(step) - 1, 0));
  }, [step, steps]);

  const toggleInterest = useCallback((categoryId: string) => {
    setForm((previous) => {
      const selected = previous.interests.includes(categoryId);
      if (selected) {
        return { ...previous, interests: previous.interests.filter((id) => id !== categoryId) };
      }
      if (previous.interests.length >= MAX_INTERESTS) {
        return previous;
      }
      return { ...previous, interests: [...previous.interests, categoryId] };
    });
  }, []);

  const busy = saveOnboarding.isPending;

  return (
    <section className="pb-28">
      <header className="mb-4">
        <p className="text-muted-foreground text-sm">
          گام {formatFaDigits(steps.indexOf(step) + 1)} از {formatFaDigits(steps.length)}
          {draftRestored ? ' — پیش‌نویس بازیابی شد' : ''}
        </p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-foreground mt-1 text-xl font-semibold outline-none"
        >
          {STEP_TITLES_FA[step]}
        </h2>
        <ol className="mt-3 flex gap-1.5" aria-hidden="true">
          {steps.map((stepId, index) => (
            <li
              key={stepId}
              className={
                index === steps.indexOf(step)
                  ? 'bg-primary h-1.5 flex-1 rounded-full'
                  : index < stepIndex
                    ? 'bg-primary/40 h-1.5 flex-1 rounded-full'
                    : 'bg-border h-1.5 flex-1 rounded-full'
              }
            />
          ))}
        </ol>
      </header>

      {step === 'role' ? (
        <StepRole
          isBuyer={form.isBuyer}
          isSeller={form.isSeller}
          error={errors.isBuyer}
          onChange={(role) => patchForm(role)}
        />
      ) : null}
      {step === 'identity' ? (
        <StepIdentity
          value={{
            displayName: form.displayName,
            businessName: form.businessName,
            province: form.province,
            city: form.city,
          }}
          errors={{
            displayName: errors.displayName,
            businessName: errors.businessName,
            province: errors.province,
            city: errors.city,
          }}
          isSeller={form.isSeller}
          onChange={(patch) => patchForm(patch)}
        />
      ) : null}
      {step === 'interests' ? (
        <StepInterests
          tree={categories.data}
          selected={form.interests}
          max={MAX_INTERESTS}
          error={errors.interests}
          isLoading={categories.isPending}
          loadError={categories.isError}
          onRetry={() => {
            void categories.refetch();
          }}
          onToggle={toggleInterest}
        />
      ) : null}
      {step === 'sellerExtras' ? (
        <StepSellerExtras
          value={{
            sellerYearsActive: form.sellerYearsActive,
            sellerBusinessType: form.sellerBusinessType,
            sellerDescription: form.sellerDescription,
          }}
          errors={{
            sellerYearsActive: errors.sellerYearsActive,
            sellerBusinessType: errors.sellerBusinessType,
            sellerDescription: errors.sellerDescription,
          }}
          onChange={(patch) => patchForm(patch)}
        />
      ) : null}
      {step === 'links' ? (
        <StepLinks
          value={{ instagram: form.instagram, website: form.website }}
          errors={{ instagram: errors.instagram, website: errors.website }}
          onChange={(patch) => patchForm(patch)}
        />
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 p-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-(--app-max-width) gap-3">
          {steps.indexOf(step) > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              onClick={goBack}
              disabled={busy}
            >
              بازگشت
            </Button>
          ) : null}
          <Button type="button" className="h-11 flex-[2]" onClick={goNext} disabled={busy}>
            {busy ? 'در حال ذخیره…' : isLastStep ? 'پایان و ذخیره' : 'بعدی'}
          </Button>
        </div>
      </div>
    </section>
  );
}
