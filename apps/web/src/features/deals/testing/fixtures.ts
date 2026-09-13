import type { DealResponseDto } from '@monorepo/shared-types';

/**
 * DEAL-004 deal fixture — `dealResponseSchema` validates this shape in the
 * fetcher, so keep it contract-exact (the lot summary + the locked terms,
 * notes included). The current user is the BUYER of this deal unless
 * overridden (myRole).
 */
export function dealFixture(overrides: Partial<DealResponseDto> = {}): DealResponseDto {
  return {
    id: 'deal-1',
    code: '9Xk2Qm7b',
    lot: {
      code: '7Kd2Qm9x',
      title: 'عمده پیراهن مردانه — ۵۰ عدد',
    },
    quantity: 10,
    unitPrice: 300_000,
    totalPrice: 3_000_000,
    deliveryMethod: 'SELLER_SHIPS',
    deliveryNote: null,
    paymentMethod: 'CARD_TO_CARD',
    paymentTermsNote: null,
    status: 'NEGOTIATING',
    createdAt: '2026-09-05T10:00:00.000Z',
    myRole: 'buyer',
    ...overrides,
  };
}

/** A whole GET /deals page envelope for fetch mocks. */
export function dealsPageFixture(
  items: DealResponseDto[],
  total = items.length,
): { items: DealResponseDto[]; total: number; page: number; limit: number } {
  return { items, total, page: 1, limit: items.length };
}

/** A deal-detail payload (the deal + a birth timeline entry). */
export function dealDetailFixture(
  overrides: Partial<import('@monorepo/shared-types').DealDetailResponseDto> = {},
): import('@monorepo/shared-types').DealDetailResponseDto {
  return {
    ...dealFixture(overrides),
    events: [
      {
        id: 'event-1',
        actorRole: 'buyer',
        fromStatus: 'NEGOTIATING',
        toStatus: 'NEGOTIATING',
        note: 'معامله ایجاد شد #9Xk2Qm7b',
        createdAt: '2026-09-05T10:00:00.000Z',
      },
    ],
    ...overrides,
  };
}
