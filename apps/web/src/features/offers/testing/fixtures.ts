import type { OfferResponseDto } from '@monorepo/shared-types';

/**
 * OFR-004 offer fixture — `offerResponseSchema` validates this shape in the
 * fetcher, so keep it contract-exact (the recomposed lot summary included).
 * The current user is the BUYER of this offer unless overridden (myRole).
 */
export function offerFixture(overrides: Partial<OfferResponseDto> = {}): OfferResponseDto {
  return {
    id: 'offer-1',
    lot: {
      code: '7Kd2Qm9x',
      title: 'عمده پیراهن مردانه — ۵۰ عدد',
      unitPrice: 300_000,
    },
    quantity: 500,
    unitPrice: 300_000,
    totalPrice: 150_000_000,
    note: null,
    status: 'PENDING',
    expiresAt: '2026-09-08T10:00:00.000Z',
    decidedAt: null,
    createdAt: '2026-09-05T10:00:00.000Z',
    myRole: 'buyer',
    ...overrides,
  };
}

/** A whole GET /offers page envelope for fetch mocks. */
export function offersPageFixture(
  items: OfferResponseDto[],
  total = items.length,
): { items: OfferResponseDto[]; total: number; page: number; limit: number } {
  return { items, total, page: 1, limit: items.length };
}
