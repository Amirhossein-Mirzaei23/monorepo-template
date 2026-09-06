'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreateLotDto,
  LiquidationReason,
  LotCondition,
  LotOwnerResponseDto,
  LotUnit,
  PricingType,
  UpdateLotDto,
} from '@monorepo/shared-types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api-client';
import { formatFaDigits } from '@/lib/format';
import { useCategories } from '@/features/categories';
import type { MediaItem } from '@/features/media';
import { useCreateLot } from '../hooks/use-create-lot';
import { useLot } from '../hooks/use-lot';
import { useUpdateLot } from '../hooks/use-update-lot';
import { useUpdateLotMedia } from '../hooks/use-update-lot-media';
import {
  lotFormSchema,
  lotWizardMode,
  LOT_STATUS_LABELS_FA,
  STEP_FIELDS,
  STEP_ORDER,
  STEP_TITLES_FA,
  type LotFormData,
  type LotStepId,
  type LotWizardMode,
} from '../schemas/lot-schema';
import { LotSummaryCard } from './lot-summary-card';
import { StepBasics } from './steps/step-basics';
import { StepClassification } from './steps/step-classification';
import { StepMedia } from './steps/step-media';
import { StepPricing } from './steps/step-pricing';
import type { LotMediaPutPayload } from '../types';

const DRAFT_STORAGE_KEY = 'rakdsho:lot-draft';
/** Debounced PATCH autosave for existing DRAFT lots (card: «drafts autosaved»). */
const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * Raw form state — numbers stay strings while typing, selects may hold ''
 * (placeholder). Converted to the schema input, validated once per render,
 * and turned into API payloads from the parsed result.
 */
interface LotFormState {
  title: string;
  description: string;
  categoryId: string;
  subcategoryId: string;
  totalPrice: string;
  quantity: string;
  unit: LotUnit | '';
  availableQuantity: string;
  minOrderQuantity: string;
  pricingType: PricingType | '';
  condition: LotCondition | '';
  liquidationReason: LiquidationReason | '';
  province: string;
  city: string;
  locationHint: string;
  exactAddress: string;
}

const EMPTY_FORM_STATE: LotFormState = {
  title: '',
  description: '',
  categoryId: '',
  subcategoryId: '',
  totalPrice: '',
  quantity: '',
  unit: 'PIECE', // API default (LOT-002: unit default PIECE)
  availableQuantity: '',
  minOrderQuantity: '',
  pricingType: 'NEGOTIABLE',
  condition: '',
  liquidationReason: '',
  province: '',
  city: '',
  locationHint: '',
  exactAddress: '',
};

type FieldErrors = Partial<Record<string, string>>;

/** Persisted unsaved new-lot draft: form state (JSON-safe) + ready media tiles. */
interface WizardDraft {
  step: number;
  data: LotFormState;
  media: MediaItem[];
}

// --- raw schema input (numbers as strings/'' → zod reports the fa message) ---

type LotFormInput = Record<string, unknown>;

function toLotFormInput(form: LotFormState): LotFormInput {
  return {
    title: form.title,
    description: form.description,
    categoryId: form.categoryId,
    subcategoryId: form.subcategoryId === '' ? undefined : form.subcategoryId,
    totalPrice: form.totalPrice === '' ? undefined : Number(form.totalPrice),
    quantity: form.quantity === '' ? undefined : Number(form.quantity),
    unit: form.unit === '' ? undefined : form.unit,
    availableQuantity: form.availableQuantity === '' ? undefined : Number(form.availableQuantity),
    minOrderQuantity: form.minOrderQuantity === '' ? undefined : Number(form.minOrderQuantity),
    pricingType: form.pricingType === '' ? undefined : form.pricingType,
    condition: form.condition === '' ? undefined : form.condition,
    liquidationReason: form.liquidationReason === '' ? undefined : form.liquidationReason,
    province: form.province,
    city: form.city,
    locationHint: form.locationHint === '' ? undefined : form.locationHint,
    exactAddress: form.exactAddress === '' ? undefined : form.exactAddress,
  };
}

function formStateFromLot(lot: LotOwnerResponseDto): LotFormState {
  return {
    title: lot.title,
    description: lot.description,
    categoryId: lot.categoryId,
    subcategoryId: lot.subcategoryId ?? '',
    totalPrice: String(lot.totalPrice),
    quantity: String(lot.quantity),
    unit: lot.unit,
    availableQuantity: String(lot.availableQuantity),
    minOrderQuantity: String(lot.minOrderQuantity),
    pricingType: lot.pricingType,
    condition: lot.condition,
    liquidationReason: lot.liquidationReason,
    province: lot.province,
    city: lot.city,
    locationHint: lot.locationHint ?? '',
    exactAddress: lot.exactAddress ?? '',
  };
}

/**
 * Owner media rows → uploader tiles. Order matters: the cover is the first
 * ready tile (MediaGrid/`coverIndex` convention).
 */
function mediaItemsFromLot(lot: LotOwnerResponseDto): MediaItem[] {
  return [...lot.media]
    .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder)
    .map((media) => ({
      key: `lot-${media.mediaAssetId}`,
      kind: media.kind === 'VIDEO' ? ('video' as const) : ('image' as const),
      id: media.mediaAssetId,
      url: media.url,
      thumbUrl: media.thumbUrl ?? undefined,
      status: 'ready' as const,
    }));
}

/** Ready uploader tiles → PUT /lots/:id/media payload (cover = first tile). */
function lotMediaPayload(items: MediaItem[]): LotMediaPutPayload {
  const mediaAssetIds = items
    .filter((item) => item.status === 'ready')
    .flatMap((item) => (item.id ? [item.id] : []));
  return {
    items: mediaAssetIds.map((mediaAssetId) => ({ mediaAssetId })),
    // A cover on an empty gallery is a 400 (COVER_INDEX_OUT_OF_BOUNDS).
    ...(mediaAssetIds.length > 0 ? { coverIndex: 0 } : {}),
  };
}

// --- payload builders from PARSED data (PATCH keeps explicit nulls so clears persist) ---

function toCreatePayload(data: LotFormData, submit: boolean): CreateLotDto {
  return {
    title: data.title.trim(),
    description: data.description,
    categoryId: data.categoryId,
    subcategoryId: data.subcategoryId ?? null,
    quantity: data.quantity,
    availableQuantity: data.availableQuantity ?? data.quantity,
    minOrderQuantity: data.minOrderQuantity ?? 1,
    unit: data.unit,
    totalPrice: data.totalPrice,
    pricingType: data.pricingType,
    condition: data.condition,
    liquidationReason: data.liquidationReason,
    province: data.province,
    city: data.city,
    locationHint: data.locationHint ?? null,
    exactAddress: data.exactAddress ?? null,
    submit,
  };
}

function toUpdatePayload(data: LotFormData): UpdateLotDto {
  return {
    title: data.title.trim(),
    description: data.description,
    categoryId: data.categoryId,
    subcategoryId: data.subcategoryId ?? null,
    quantity: data.quantity,
    availableQuantity: data.availableQuantity ?? data.quantity,
    minOrderQuantity: data.minOrderQuantity ?? 1,
    unit: data.unit,
    totalPrice: data.totalPrice,
    pricingType: data.pricingType,
    condition: data.condition,
    liquidationReason: data.liquidationReason,
    province: data.province,
    city: data.city,
    locationHint: data.locationHint ?? null,
    exactAddress: data.exactAddress ?? null,
  };
}

/** ACTIVE/PAUSED patch — exactly the API's editable subset (price/quantity). */
function toPricingPatch(data: LotFormData): UpdateLotDto {
  return {
    quantity: data.quantity,
    availableQuantity: data.availableQuantity ?? data.quantity,
    minOrderQuantity: data.minOrderQuantity ?? 1,
    totalPrice: data.totalPrice,
  };
}

// --- validation helpers (per-step slices, like the onboarding wizard) ---

function collectFieldErrors(input: LotFormInput): FieldErrors {
  const result = lotFormSchema.safeParse(input);
  if (result.success) {
    return {};
  }
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

function stepErrors(input: LotFormInput, step: LotStepId): FieldErrors {
  const all = collectFieldErrors(input);
  const fields = STEP_FIELDS[step] as readonly string[];
  const errors: FieldErrors = {};
  for (const field of fields) {
    if (all[field]) {
      errors[field] = all[field];
    }
  }
  return errors;
}

// --- localStorage draft (NEW lots only; existing drafts autosave via PATCH) ---

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
    // Non-ready tiles are dead after a reload (blob URLs, in-flight uploads).
    const media = Array.isArray(parsed.media)
      ? parsed.media.filter((item) => item.status === 'ready' && item.id)
      : [];
    return { step: parsed.step, data: { ...EMPTY_FORM_STATE, ...parsed.data }, media };
  } catch {
    return undefined;
  }
}

function persistDraft(draft: WizardDraft): void {
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage full/unavailable — drafts are best-effort.
  }
}

// --- status banner ---

function StatusBanner({
  tone,
  title,
  detail,
}: {
  tone: 'info' | 'warning' | 'danger';
  title: string;
  detail?: string;
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-destructive/40 bg-destructive/10 text-destructive'
      : tone === 'warning'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
        : 'border-border bg-muted text-foreground';
  return (
    <div role="status" className={`rounded-xl border p-4 text-sm ${toneClass}`}>
      <p className="font-medium">{title}</p>
      {detail ? <p className="mt-1">{detail}</p> : null}
    </div>
  );
}

export interface CreateLotWizardProps {
  /** Present → edit mode (owner lot id); absent → create a new lot. */
  lotId?: string;
}

/**
 * LOT-004 create/edit lot wizard: media → basics → pricing/quantity →
 * classification/location → review & submit; sticky bottom CTA (≥52px),
 * per-step zod validation, Persian copy throughout (ZWNJ kept).
 *
 * Media-attach choreography — media can only link to an EXISTING lot, and the
 * API only lets DRAFT/REJECTED lots change media, so every PUT must land while
 * the lot is still editable (a submit:true save first would 409 the PUT):
 * - NEW lots: the media step collects uploaded asset ids as a *pending* list
 *   in wizard state (mirrored into the localStorage draft). Submit flow:
 *   POST /lots saves the DRAFT (submit:false) → PUT /lots/:id/media attaches
 *   the gallery → PATCH {submit:true} flips DRAFT→PENDING_REVIEW. A failed
 *   media PUT stops the chain: the lot stays a DRAFT (no submit PATCH) and an
 *   error toast sends the user to the edit page to retry. Draft-save flow:
 *   POST (submit:false) → PUT → done.
 * - EDIT (DRAFT/REJECTED): existing media hydrate into the uploader; a dirty
 *   gallery is PUT BEFORE the PATCH (the lot's last editable moment) and a
 *   failed PUT aborts the PATCH. Listed (ACTIVE/PAUSED) lots never PUT media
 *   (upstream 409) and PATCH only the price/quantity subset — mirrors
 *   LotsService.updateListedLot.
 *
 * Draft autosave: debounced silent PATCH for existing DRAFTs; localStorage for
 * unsaved new-lot state (like the onboarding wizard).
 */
export function CreateLotWizard({ lotId }: CreateLotWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const createLot = useCreateLot();
  const updateLot = useUpdateLot();
  const updateLotMedia = useUpdateLotMedia();
  const categories = useCategories();

  // --- owner lot (edit mode) ---
  const lotQuery = useLot(lotId);
  const lot = lotQuery.data;

  const [initialDraft] = useState(() => (lotId === undefined ? loadDraft() : undefined));
  const [form, setForm] = useState<LotFormState>(() => initialDraft?.data ?? EMPTY_FORM_STATE);
  const [stepIndex, setStepIndex] = useState(() =>
    initialDraft ? Math.max(0, Math.min(initialDraft.step, STEP_ORDER.length - 1)) : 0,
  );
  const [media, setMedia] = useState<MediaItem[]>(() => initialDraft?.media ?? []);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [hydrated, setHydrated] = useState(lotId === undefined);
  const [submittedLot, setSubmittedLot] = useState<LotOwnerResponseDto | null>(null);

  const hydratedRef = useRef(false);
  // JSON snapshot of the gallery the lot started with (media-PUT dirty gate).
  const [initialMediaJson, setInitialMediaJson] = useState<string | null>(
    lotId === undefined ? '[]' : null,
  );
  // JSON snapshot of the last payload the server accepted (autosave gate).
  const lastSavedPayloadRef = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Hydrate once the owner lot arrives (edit modes only).
  useEffect(() => {
    if (hydratedRef.current || !lot) {
      return;
    }
    hydratedRef.current = true;
    const nextForm = formStateFromLot(lot);
    const nextMedia = mediaItemsFromLot(lot);
    const nextInput = toLotFormInput(nextForm);
    setForm(nextForm);
    setMedia(nextMedia);
    setInitialMediaJson(JSON.stringify(nextMedia));
    const parsed = lotFormSchema.safeParse(nextInput);
    lastSavedPayloadRef.current = parsed.success
      ? JSON.stringify(toUpdatePayload(parsed.data))
      : null;
    setHydrated(true);
  }, [lot]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [stepIndex]);

  const patchForm = useCallback((patch: Partial<LotFormState>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setErrors((previous) => {
      const next = { ...previous };
      for (const key of Object.keys(patch)) {
        delete next[key];
      }
      return next;
    });
  }, []);

  const formInput = useMemo(() => toLotFormInput(form), [form]);
  // One parse per render: drives step gating, autosave, review and payloads.
  const parsed = useMemo(() => lotFormSchema.safeParse(formInput), [formInput]);
  // Stable JSON of the full update payload — autosave debounce key.
  const updatePayloadJson = useMemo(
    () => (parsed.success ? JSON.stringify(toUpdatePayload(parsed.data)) : null),
    [parsed],
  );

  const mode: LotWizardMode =
    lotId === undefined ? 'create' : hydrated ? lotWizardMode(lot?.status) : 'draft'; // pre-hydration placeholder; loading branch renders instead

  // Autosave the unsaved NEW-lot draft to localStorage on every change.
  useEffect(() => {
    if (lotId !== undefined || submittedLot) {
      return;
    }
    persistDraft({ step: stepIndex, data: form, media });
  }, [form, media, stepIndex, lotId, submittedLot]);

  // Debounced silent PATCH autosave — existing DRAFT lots only. Keyed on the
  // payload JSON (stable across unrelated re-renders) so the debounce survives.
  useEffect(() => {
    if (mode !== 'draft' || !hydrated || lotId === undefined || submittedLot) {
      return;
    }
    if (createLot.isPending || updateLot.isPending || updateLotMedia.isPending) {
      return;
    }
    if (updatePayloadJson === null || lastSavedPayloadRef.current === null) {
      return; // silent on invalid partial input — explicit save reports errors
    }
    if (updatePayloadJson === lastSavedPayloadRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      const payload = JSON.parse(updatePayloadJson) as UpdateLotDto;
      updateLot.mutate(
        { id: lotId, payload },
        {
          onSuccess: () => {
            lastSavedPayloadRef.current = updatePayloadJson;
          },
        },
      );
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation objects are unstable; mutate is stable and isPending flags gate in-flight saves
  }, [
    updatePayloadJson,
    mode,
    hydrated,
    lotId,
    submittedLot,
    createLot.isPending,
    updateLot.isPending,
    updateLotMedia.isPending,
  ]);

  // Gallery dirty-check for the media-PUT gate (edit mode only — null pre-hydration).
  const mediaJson = JSON.stringify(media);
  const mediaDirty = initialMediaJson !== null && mediaJson !== initialMediaJson;

  const steps = useMemo<LotStepId[]>(
    () => (mode === 'pricing' ? ['pricing'] : [...STEP_ORDER]),
    [mode],
  );
  const step = steps[Math.min(stepIndex, steps.length - 1)] ?? 'media';
  const isReviewStep = mode !== 'pricing' && step === 'review';

  // --- saving ---

  const handleSaveError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.body?.code === 'SELLER_REQUIRED') {
        toast('برای ساخت آگهی ابتدا باید فروشنده شوید', 'error');
        router.replace('/onboarding');
        return;
      }
      if (error instanceof ApiError && error.body?.code === 'ILLEGAL_STATUS_EDIT') {
        toast('این آگهی در وضعیت فعلی قابل ویرایش نیست', 'error');
        return;
      }
      if (error instanceof ApiError && error.status === 400) {
        const messages = error.body?.message;
        const detail = Array.isArray(messages) ? messages.join('؛ ') : messages;
        toast(
          detail ? `ذخیره ناموفق بود — ${detail}` : 'ذخیره ناموفق بود — دوباره تلاش کنید',
          'error',
        );
        return;
      }
      toast('ذخیره ناموفق بود — دوباره تلاش کنید', 'error');
    },
    [router, toast],
  );

  /** Attach the pending gallery once the lot JSON exists (see choreography).
   *  Fires only when the gallery CHANGED since load — a hydrated, untouched
   *  gallery must never re-PUT (and listed lots never reach here at all).
   *  onMediaFailed keeps control with the caller: a failed PUT must ABORT the
   *  follow-up save/submit (the API only accepts media on editable lots). */
  const attachMedia = useCallback(
    (attachToLotId: string, handlers: { onSuccess: () => void; onMediaFailed: () => void }) => {
      if (!mediaDirty) {
        handlers.onSuccess();
        return;
      }
      updateLotMedia.mutate(
        { id: attachToLotId, payload: lotMediaPayload(media) },
        {
          onSuccess: handlers.onSuccess,
          onError: handlers.onMediaFailed,
        },
      );
    },
    // mediaDirty is derived from media; listing it keeps the closure honest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [media, updateLotMedia],
  );

  const clearLocalDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Best-effort clear.
    }
  }, []);

  /** Validate everything, then create/patch (+ media PUT) with `submit` intent. */
  const save = useCallback(
    (submit: boolean) => {
      if (!parsed.success) {
        const allErrors = collectFieldErrors(formInput);
        setErrors(allErrors);
        const firstOffendingStep = STEP_ORDER.find((id) =>
          (STEP_FIELDS[id] as readonly string[]).some((field) => field in allErrors),
        );
        if (firstOffendingStep && steps.includes(firstOffendingStep)) {
          setStepIndex(steps.indexOf(firstOffendingStep));
        }
        toast('لطفاً خطاهای فرم را برطرف کنید', 'error');
        return;
      }
      setErrors({});

      if (mode === 'create') {
        // The POST always materializes a DRAFT (submit:false): the media PUT
        // is only legal while the lot is editable, so submit:true on the POST
        // would 409 it. The submit intent moves to a trailing PATCH instead.
        createLot.mutate(toCreatePayload(parsed.data, false), {
          onSuccess: (createdLot) => {
            clearLocalDraft();
            attachMedia(createdLot.id, {
              onSuccess: () => {
                if (submit) {
                  // Gallery attached while DRAFT → now DRAFT→PENDING_REVIEW.
                  updateLot.mutate(
                    { id: createdLot.id, payload: { submit: true } },
                    {
                      onSuccess: (submittedLotData) => setSubmittedLot(submittedLotData),
                      onError: handleSaveError,
                    },
                  );
                  return;
                }
                // First save materializes the lot — continue on its edit route.
                toast('پیش‌نویس ذخیره شد', 'success');
                router.replace(`/dashboard/lots/${createdLot.id}/edit`);
              },
              onMediaFailed: () => {
                // Never submit after a failed media PUT: the lot stays a
                // DRAFT; the edit page is the retry affordance for the media.
                toast(
                  'ذخیره رسانه‌ها ناموفق بود — آگهی به‌صورت پیش‌نویس باقی ماند؛ از صفحه ویرایش دوباره تلاش کنید',
                  'error',
                );
                router.replace(`/dashboard/lots/${createdLot.id}/edit`);
              },
            });
          },
          onError: handleSaveError,
        });
        return;
      }

      if (mode === 'draft' && lotId !== undefined) {
        // Media PUT BEFORE the PATCH: DRAFT/REJECTED is the last moment the
        // API accepts media, and a submit:true PATCH first would 409 the PUT.
        attachMedia(lotId, {
          onSuccess: () =>
            updateLot.mutate(
              { id: lotId, payload: { ...toUpdatePayload(parsed.data), submit } },
              {
                onSuccess: (savedLot) => {
                  lastSavedPayloadRef.current = updatePayloadJson;
                  if (submit) {
                    setSubmittedLot(savedLot);
                    return;
                  }
                  toast('پیش‌نویس ذخیره شد', 'success');
                },
                onError: handleSaveError,
              },
            ),
          onMediaFailed: () => {
            // Abort the PATCH — saving/submitting after a failed media PUT
            // would lock the lot out of its own gallery. Stay here and retry.
            toast('ذخیره رسانه‌ها ناموفق بود — تغییرات ذخیره نشد؛ دوباره تلاش کنید', 'error');
          },
        });
        return;
      }

      if (mode === 'pricing' && lotId !== undefined) {
        updateLot.mutate(
          { id: lotId, payload: toPricingPatch(parsed.data) },
          {
            onSuccess: () => {
              toast('تغییرات ذخیره شد', 'success');
            },
            onError: handleSaveError,
          },
        );
      }
    },
    [
      attachMedia,
      clearLocalDraft,
      createLot,
      formInput,
      handleSaveError,
      lotId,
      mode,
      parsed,
      router,
      steps,
      toast,
      updateLot,
      updatePayloadJson,
    ],
  );

  const goNext = useCallback(() => {
    if (mode === 'pricing') {
      save(false);
      return;
    }
    const currentStepErrors = stepErrors(formInput, step);
    setErrors(currentStepErrors);
    if (Object.keys(currentStepErrors).length > 0) {
      return;
    }
    if (isReviewStep) {
      return; // the review step renders its own two submit actions
    }
    setStepIndex(Math.min(steps.indexOf(step) + 1, steps.length - 1));
  }, [formInput, isReviewStep, mode, save, step, steps]);

  const goBack = useCallback(() => {
    setErrors({});
    setStepIndex(Math.max(steps.indexOf(step) - 1, 0));
  }, [step, steps]);

  // --- render ---

  const busy = createLot.isPending || updateLot.isPending || updateLotMedia.isPending;

  const categoryLabel = useMemo(() => {
    const parent = categories.data?.find((node) => node.id === form.categoryId);
    if (!parent) {
      return undefined;
    }
    const child = parent.children.find((node) => node.id === form.subcategoryId);
    return child ? `${parent.nameFa} › ${child.nameFa}` : parent.nameFa;
  }, [categories.data, form.categoryId, form.subcategoryId]);

  // submit=true lands on the «در انتظار بررسی» success state.
  if (submittedLot) {
    return (
      <section className="grid gap-4 py-8 text-center">
        <div className="mx-auto grid gap-2">
          <h2 className="text-foreground text-xl font-semibold">آگهی شما در انتظار بررسی است</h2>
          <p className="text-muted-foreground text-sm">
            وضعیت آگهی: «در انتظار بررسی» — نتیجه بررسی به‌زودی اعلام می‌شود.
          </p>
        </div>
        <Button
          className="mx-auto h-13 w-full max-w-xs"
          onClick={() => router.replace('/dashboard')}
        >
          بازگشت به داشبورد
        </Button>
      </section>
    );
  }

  // Edit-mode branches: loading → error → read-only.
  if (lotId !== undefined) {
    if (lotQuery.isPending) {
      return (
        <p className="text-muted-foreground py-8 text-center" aria-busy="true">
          در حال بارگذاری آگهی…
        </p>
      );
    }
    if (lotQuery.isError || !lot) {
      return (
        <div className="grid gap-3 py-8 text-center">
          <p className="text-muted-foreground text-sm">آگهی بارگذاری نشد.</p>
          <Button
            variant="outline"
            className="mx-auto h-11"
            onClick={() => void lotQuery.refetch()}
          >
            تلاش دوباره
          </Button>
        </div>
      );
    }
    if (mode === 'readonly') {
      return (
        <section className="grid gap-4 pb-10">
          <StatusBanner
            tone="info"
            title={`این آگهی در وضعیت «${LOT_STATUS_LABELS_FA[lot.status]}» است و قابل ویرایش نیست.`}
          />
          {parsed.success ? (
            <LotSummaryCard data={parsed.data} media={media} categoryLabel={categoryLabel} />
          ) : (
            <p className="text-muted-foreground text-sm">{lot.title}</p>
          )}
        </section>
      );
    }
  }

  const statusBanner =
    mode === 'draft' && lot?.status === 'REJECTED' ? (
      <StatusBanner
        tone="danger"
        title="آگهی شما رد شده است — پس از اصلاح می‌توانید دوباره ارسال کنید."
        detail={lot.rejectionReason ? `دلیل: ${lot.rejectionReason}` : undefined}
      />
    ) : mode === 'draft' && lot?.status === 'DRAFT' ? (
      <StatusBanner tone="info" title="پیش‌نویس — تغییرات به‌طور خودکار ذخیره می‌شود." />
    ) : mode === 'pricing' ? (
      <StatusBanner
        tone="warning"
        title="آگهی فعال است — فقط قیمت و موجودی قابل ویرایش است."
        detail="ویرایش محتوای دیگر، آگهی را به بازبینی برمی‌گرداند."
      />
    ) : null;

  return (
    <section className="pb-28">
      {statusBanner ? <div className="mb-4 grid gap-2">{statusBanner}</div> : null}

      {mode === 'pricing' ? (
        <header className="mb-4">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-foreground text-xl font-semibold outline-none"
          >
            قیمت و موجودی
          </h2>
        </header>
      ) : (
        <header className="mb-4">
          <p className="text-muted-foreground text-sm">
            گام {formatFaDigits(steps.indexOf(step) + 1)} از {formatFaDigits(steps.length)}
            {initialDraft ? ' — پیش‌نویس بازیابی شد' : ''}
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
      )}

      {step === 'media' ? <StepMedia value={media} onChange={setMedia} disabled={busy} /> : null}
      {step === 'basics' ? (
        <StepBasics
          value={{ title: form.title, description: form.description }}
          errors={{ title: errors.title, description: errors.description }}
          onChange={(patch) => patchForm(patch)}
        />
      ) : null}
      {step === 'pricing' ? (
        <StepPricing
          value={{
            totalPrice: form.totalPrice,
            quantity: form.quantity,
            unit: form.unit,
            availableQuantity: form.availableQuantity,
            minOrderQuantity: form.minOrderQuantity,
            pricingType: form.pricingType,
          }}
          errors={{
            totalPrice: errors.totalPrice,
            quantity: errors.quantity,
            unit: errors.unit,
            availableQuantity: errors.availableQuantity,
            minOrderQuantity: errors.minOrderQuantity,
            pricingType: errors.pricingType,
          }}
          onChange={(patch) => patchForm(patch)}
        />
      ) : null}
      {step === 'classification' ? (
        <StepClassification
          value={{
            categoryId: form.categoryId,
            subcategoryId: form.subcategoryId,
            condition: form.condition,
            liquidationReason: form.liquidationReason,
            province: form.province,
            city: form.city,
            locationHint: form.locationHint,
            exactAddress: form.exactAddress,
          }}
          errors={{
            categoryId: errors.categoryId,
            condition: errors.condition,
            liquidationReason: errors.liquidationReason,
            province: errors.province,
            city: errors.city,
            locationHint: errors.locationHint,
            exactAddress: errors.exactAddress,
          }}
          onChange={(patch) => patchForm(patch)}
        />
      ) : null}
      {step === 'review' ? (
        parsed.success ? (
          <LotSummaryCard data={parsed.data} media={media} categoryLabel={categoryLabel} />
        ) : (
          <p className="text-muted-foreground text-sm">
            برای مشاهده بازبینی، ابتدا مراحل قبل را کامل کنید.
          </p>
        )
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 p-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-(--app-max-width) gap-3">
          {steps.indexOf(step) > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="h-13 flex-1"
              onClick={goBack}
              disabled={busy}
            >
              بازگشت
            </Button>
          ) : null}
          {isReviewStep ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-13 flex-1"
                onClick={() => save(false)}
                disabled={busy}
              >
                ذخیره پیش‌نویس
              </Button>
              <Button
                type="button"
                className="h-13 flex-1"
                onClick={() => save(true)}
                disabled={busy}
              >
                {busy ? 'در حال ذخیره…' : 'ارسال برای بررسی'}
              </Button>
            </>
          ) : (
            <Button type="button" className="h-13 flex-[2]" onClick={goNext} disabled={busy}>
              {busy ? 'در حال ذخیره…' : mode === 'pricing' ? 'ذخیره تغییرات' : 'بعدی'}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
