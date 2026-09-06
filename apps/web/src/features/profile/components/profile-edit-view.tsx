'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ProfileResponseDto } from '@monorepo/shared-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import {
  StepIdentity,
  StepInterests,
  StepLinks,
  StepSellerExtras,
  useCategories,
} from '@/features/onboarding';
import { formatJalali } from '@/lib/format';
import { useMyProfile } from '../hooks/use-my-profile';
import { useUpdateProfile } from '../hooks/use-update-profile';
import {
  toProfileFormState,
  toUpdatePayload,
  validateProfileForm,
  type ProfileFieldErrors,
  type ProfileFormState,
  type ProfileFormData,
} from '../schemas/profile-schema';
import { AvatarSlot } from './avatar-slot';
import { ProfileMetrics } from './profile-metrics';
import { ProfileRoles } from './profile-roles';

const MAX_INTERESTS = 10;

/** Inputs/selects hold strings in form state; numbers/enums convert on submit. */
function toFormData(form: ProfileFormState): ProfileFormData {
  return {
    ...form,
    sellerYearsActive: form.sellerYearsActive === '' ? undefined : Number(form.sellerYearsActive),
    sellerBusinessType:
      form.sellerBusinessType === ''
        ? undefined
        : (form.sellerBusinessType as ProfileFormData['sellerBusinessType']),
  };
}

/**
 * My-profile view/edit (PROF-001): the settings form is prefilled from
 * GET /profiles/me and reuses the onboarding step field components (identity,
 * seller extras, interests, links — imported via the onboarding barrel per the
 * cross-feature rule). Saving PATCHes /profiles/me; invalidation makes the
 * form reflect the saved state immediately (card acceptance).
 */
export function ProfileEditView() {
  const profile = useMyProfile();

  if (profile.isPending) {
    return (
      <section aria-busy="true" aria-label="در حال بارگذاری پروفایل" className="grid gap-4">
        <div className="bg-muted h-24 animate-pulse rounded-xl" />
        <div className="bg-muted h-64 animate-pulse rounded-xl" />
        <div className="bg-muted h-40 animate-pulse rounded-xl" />
      </section>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <section className="py-6 text-center">
        <h1 className="text-foreground text-xl font-semibold">پروفایل من</h1>
        <p role="alert" className="text-muted-foreground mt-2 text-sm">
          پروفایل بارگذاری نشد.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-11"
          onClick={() => {
            void profile.refetch();
          }}
        >
          تلاش دوباره
        </Button>
      </section>
    );
  }

  // Keyed remount instead of a setState-in-effect prefill: the form seeds
  // itself once from the fetched profile (lazy useState initializer, like the
  // onboarding draft restore), and a save re-seeds it by changing the key —
  // the invalidated query returns a new `updatedAt` after PATCH succeeds.
  // Refetches that do not change the saved state keep the key (and the
  // user's mid-edit typing) intact.
  return <ProfileEditForm key={profile.data.updatedAt} profile={profile.data} />;
}

function ProfileEditForm({ profile }: { profile: ProfileResponseDto }) {
  const categories = useCategories();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();

  const [form, setForm] = useState<ProfileFormState>(() => toProfileFormState(profile));
  const [errors, setErrors] = useState<ProfileFieldErrors>({});

  const patchForm = useCallback((patch: Partial<ProfileFormState>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setErrors((previous) => {
      const next = { ...previous };
      for (const key of Object.keys(patch) as Array<keyof ProfileFormState>) {
        delete next[key];
      }
      return next;
    });
  }, []);

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

  const toggleAddRole = useCallback((role: 'buyer' | 'seller') => {
    setForm((previous) =>
      role === 'buyer'
        ? { ...previous, isBuyer: !previous.isBuyer }
        : { ...previous, isSeller: !previous.isSeller },
    );
  }, []);

  const formData = useMemo(() => toFormData(form), [form]);

  const save = useCallback(() => {
    const validationErrors = validateProfileForm(formData);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      toast('لطفاً خطاهای فرم را برطرف کنید', 'error');
      return;
    }
    updateProfile.mutate(toUpdatePayload(formData, profile));
  }, [formData, profile, updateProfile, toast]);

  const addedBuyer = form.isBuyer && !profile.isBuyer;
  const addedSeller = form.isSeller && !profile.isSeller;
  const busy = updateProfile.isPending;

  return (
    <section className="pb-28">
      <div className="flex items-center gap-4">
        <AvatarSlot displayName={form.displayName} />
        <div className="min-w-0">
          <h1 className="text-foreground truncate text-xl font-semibold">پروفایل من</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            عضویت از {formatJalali(profile.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <ProfileMetrics metrics={profile.metrics} />

        <Card>
          <CardHeader>
            <CardTitle>نقش‌ها</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileRoles
              isBuyer={profile.isBuyer}
              isSeller={profile.isSeller}
              addedBuyer={addedBuyer}
              addedSeller={addedSeller}
              onToggleAdd={toggleAddRole}
              error={errors.isBuyer}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>مشخصات</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
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
            {/* bio has no onboarding counterpart (ONB-002 skipped it) — own field here. */}
            <div className="grid gap-2">
              <Label htmlFor="profile-bio">درباره شما (اختیاری)</Label>
              <textarea
                id="profile-bio"
                value={form.bio}
                onChange={(event) => patchForm({ bio: event.target.value })}
                aria-invalid={Boolean(errors.bio) || undefined}
                rows={3}
                placeholder="مثلاً خرید عمده پوشاک برای فروشگاه"
                className="border-input bg-background text-foreground min-h-20 w-full resize-y rounded-md border p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
              {errors.bio ? (
                <p role="alert" className="text-destructive text-sm">
                  {errors.bio}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {form.isSeller ? (
          <Card>
            <CardHeader>
              <CardTitle>اطلاعات فروشندگی</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>علاقه‌مندی‌ها</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>لینک‌ها</CardTitle>
          </CardHeader>
          <CardContent>
            <StepLinks
              value={{ instagram: form.instagram, website: form.website }}
              errors={{ instagram: errors.instagram, website: errors.website }}
              onChange={(patch) => patchForm(patch)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 p-4 backdrop-blur">
        <div className="mx-auto w-full max-w-(--app-max-width)">
          <Button type="button" className="h-11 w-full" onClick={save} disabled={busy}>
            {busy ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
          </Button>
        </div>
      </div>
    </section>
  );
}
