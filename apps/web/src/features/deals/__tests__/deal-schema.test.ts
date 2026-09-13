import {
  dealActionWaitingHint,
  dealActionsFor,
  dealPaymentAnnounced,
} from '../schemas/deal-schema';
import type { DealEventViewDto } from '@monorepo/shared-types';

/**
 * DEAL-004 — the ACTION VISIBILITY MATRIX (the card's required component
 * test): for EVERY status × role, the rendered action bar must mirror the
 * DEAL-001 transition table exactly — the viewer's own moves enabled, the
 * counterpart's disabled, and the terminal/disputed states empty (or the
 * admin-waiting note). This is the UI's independent restatement of the API
 * table, the same shape the deals.constants.spec asserts server-side.
 */

/** The API's DEAL_TRANSITIONS restated for (status → who-may-move-set), the
 * buyer/seller rows only (ADMIN resolution is DEAL-007). */
const EXPECTED: Record<
  string,
  { buyer: string[]; seller: string[] } & Record<string, readonly string[]>
> = {
  NEGOTIATING: {
    buyer: ['AGREED', 'cancel', 'dispute'],
    seller: ['AGREED', 'cancel', 'dispute'],
  },
  AGREED: {
    buyer: ['PAYMENT_PENDING', 'cancel', 'dispute'],
    seller: ['PAYMENT_PENDING', 'cancel', 'dispute'],
  },
  PAYMENT_PENDING: {
    buyer: ['payment-confirm', 'dispute'],
    seller: ['PAID', 'cancel', 'dispute'],
  },
  PAID: {
    buyer: ['dispute'],
    seller: ['PREPARING', 'dispute'],
  },
  PREPARING: {
    buyer: ['dispute'],
    seller: ['SHIPPED', 'dispute'],
  },
  SHIPPED: {
    buyer: ['dispute'],
    seller: ['DELIVERED', 'dispute'],
  },
  DELIVERED: {
    buyer: ['COMPLETED', 'dispute'],
    seller: ['dispute'],
  },
  COMPLETED: { buyer: [], seller: [] },
  CANCELLED: { buyer: [], seller: [] },
  DISPUTED: { buyer: [], seller: [] },
};

const ALL_STATUSES = Object.keys(EXPECTED);

describe('dealActionsFor — the action visibility matrix (every status × role)', () => {
  it.each(
    ALL_STATUSES.flatMap((status) =>
      (['buyer', 'seller'] as const).map((role) => [status, role] as const),
    ),
  )('%s as %s — enabled actions mirror the matrix', (status, role) => {
    const actions = dealActionsFor(status as never, role);

    const enabledKeys = actions
      .filter((action) => action.enabled)
      .map((action) => action.to ?? action.kind);
    expect([...enabledKeys].sort()).toEqual([...EXPECTED[status]![role]!].sort());

    // Every DISABLED row is one the OTHER side may perform — never an action
    // outside the matrix, and the waiting hint names the counterpart.
    for (const action of actions.filter((entry) => !entry.enabled)) {
      expect(action.roles).not.toContain(role);
      expect(dealActionWaitingHint(action, role)).toMatch(/در انتظار اقدام (فروشنده|خریدار)/);
    }
  });

  it('the payment-confirm mark hides once the timeline carries the announcement', () => {
    const announced: DealEventViewDto[] = [
      {
        id: 'e1',
        actorRole: 'buyer',
        fromStatus: 'PAYMENT_PENDING',
        toStatus: 'PAYMENT_PENDING',
        note: 'خریدار پرداخت را اعلام کرد',
        createdAt: '2026-09-05T10:00:00.000Z',
      },
    ];
    expect(dealPaymentAnnounced(announced)).toBe(true);
    expect(dealPaymentAnnounced([])).toBe(false);
  });
});

describe('the reason schemas (the API floors, mirrored)', () => {
  it('cancel: blank fails, any non-blank reason passes', async () => {
    const { cancelReasonSchema } = await import('../schemas/deal-schema');
    expect(cancelReasonSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(cancelReasonSchema.safeParse({ reason: 'خریدار منصرف شد' }).success).toBe(true);
  });

  it('dispute: under 20 code points fails, at the floor passes', async () => {
    const { disputeReasonSchema } = await import('../schemas/deal-schema');
    expect(disputeReasonSchema.safeParse({ reason: 'خیلی کوتاه' }).success).toBe(false);
    expect(
      disputeReasonSchema.safeParse({ reason: 'کالا با آنچه در عکس‌ها بود تفاوت دارد' }).success,
    ).toBe(true);
  });
});
