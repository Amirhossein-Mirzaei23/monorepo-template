/**
 * LOT-004 schema tests — the zod mirror of the API's lot rules (fa messages,
 * cross-field quantity rules, geo pair) and the edit-mode matrix that mirrors
 * LotsService.update.
 */
import {
  LIQUIDATION_REASON_LABELS_FA,
  LOT_CONDITION_LABELS_FA,
  LOT_STATUS_LABELS_FA,
  LOT_UNIT_LABELS_FA,
  lotFormSchema,
  lotWizardMode,
} from '../schemas/lot-schema';

const VALID_INPUT = {
  title: 'عمده پیراهن مردانه — ۵۰ عدد',
  description: 'توضیحات کامل کالا، جنس و شرایط فروش',
  categoryId: 'cat-apparel',
  subcategoryId: 'cat-apparel-men',
  totalPrice: 112_500_000,
  quantity: 50,
  unit: 'PIECE',
  availableQuantity: 45,
  minOrderQuantity: 10,
  pricingType: 'NEGOTIABLE',
  condition: 'GRADE_A',
  liquidationReason: 'OVERSTOCK',
  province: 'tehran',
  city: 'tehran',
  locationHint: 'بازار بزرگ تهران',
  exactAddress: 'تهران، خیابان …، پلاک ۱۲',
};

describe('lotFormSchema', () => {
  it('accepts a fully valid lot', () => {
    const result = lotFormSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  it('defaults: availableQuantity/minOrderQuantity may be omitted (API defaults)', () => {
    const result = lotFormSchema.safeParse({
      ...VALID_INPUT,
      availableQuantity: undefined,
      minOrderQuantity: undefined,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a short title with the Persian message', () => {
    const result = lotFormSchema.safeParse({ ...VALID_INPUT, title: 'abcd' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('عنوان باید حداقل ۵ نویسه باشد');
    }
  });

  it('bounds totalPrice to 1..2,000,000,000 Toman', () => {
    expect(lotFormSchema.safeParse({ ...VALID_INPUT, totalPrice: 0 }).success).toBe(false);
    const tooBig = lotFormSchema.safeParse({ ...VALID_INPUT, totalPrice: 2_000_000_001 });
    expect(tooBig.success).toBe(false);
    if (!tooBig.success) {
      expect(tooBig.error.issues[0]?.message).toContain('۲٬۰۰۰٬۰۰۰٬۰۰۰');
    }
  });

  it('rejects availableQuantity above quantity (API invariant 0 ≤ available ≤ quantity)', () => {
    const result = lotFormSchema.safeParse({ ...VALID_INPUT, availableQuantity: 51 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'موجودی قابل فروش نمی‌تواند بیشتر از کل تعداد باشد',
      );
    }
  });

  it('rejects minOrderQuantity above quantity (API invariant 1 ≤ minOrder ≤ quantity)', () => {
    const result = lotFormSchema.safeParse({ ...VALID_INPUT, minOrderQuantity: 51 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('حداقل سفارش نمی‌تواند بیشتر از کل تعداد باشد');
    }
  });

  it('rejects a city that does not belong to the chosen province', () => {
    const result = lotFormSchema.safeParse({ ...VALID_INPUT, city: 'karaj' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('شهر انتخابی مربوط به این استان نیست');
    }
  });

  it('bounds locationHint to 100 and exactAddress to 300 characters', () => {
    expect(lotFormSchema.safeParse({ ...VALID_INPUT, locationHint: 'ا'.repeat(101) }).success).toBe(
      false,
    );
    expect(lotFormSchema.safeParse({ ...VALID_INPUT, exactAddress: 'ا'.repeat(301) }).success).toBe(
      false,
    );
  });

  it('requires the enum selects (empty placeholder → Persian message)', () => {
    const result = lotFormSchema.safeParse({ ...VALID_INPUT, condition: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('وضعیت کالا را انتخاب کنید');
    }
  });
});

describe('lotWizardMode (LotsService.update matrix)', () => {
  it('new lots get the full create wizard', () => {
    expect(lotWizardMode(undefined)).toBe('create');
  });

  it('DRAFT/REJECTED are fully editable (media too)', () => {
    expect(lotWizardMode('DRAFT')).toBe('draft');
    expect(lotWizardMode('REJECTED')).toBe('draft');
  });

  it('ACTIVE/PAUSED only allow the price/quantity subset', () => {
    expect(lotWizardMode('ACTIVE')).toBe('pricing');
    expect(lotWizardMode('PAUSED')).toBe('pricing');
  });

  it('moderation/terminal statuses are read-only', () => {
    expect(lotWizardMode('PENDING_REVIEW')).toBe('readonly');
    expect(lotWizardMode('SOLD')).toBe('readonly');
    expect(lotWizardMode('EXPIRED')).toBe('readonly');
    expect(lotWizardMode('REMOVED')).toBe('readonly');
  });
});

describe('fa label maps (mirror of the API lots.constants.ts)', () => {
  it('cover every enum member and carry the canonical copy', () => {
    expect(LOT_UNIT_LABELS_FA.PIECE).toBe('عدد');
    expect(LOT_CONDITION_LABELS_FA.GRADE_A).toBe('درجه A');
    expect(LIQUIDATION_REASON_LABELS_FA.OVERSTOCK).toBe('انباشت موجودی');
    expect(LOT_STATUS_LABELS_FA.PENDING_REVIEW).toBe('در انتظار بررسی');
    expect(Object.keys(LOT_STATUS_LABELS_FA)).toHaveLength(8);
  });
});
