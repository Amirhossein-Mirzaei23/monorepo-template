import { ConflictException } from '@nestjs/common';
import { OfferStatus } from '@prisma/client';
import {
  OFFER_EXPIRY_DAYS,
  OFFER_MAX_UNIT_PRICE,
  OFFER_NOTE_MAX_LENGTH,
  OFFER_STATUS_LABELS_FA,
  OFFER_TRANSITIONS,
  assertTransition,
  canTransition,
} from '../offers.constants';

const ALL_STATUSES = Object.values(OfferStatus) as OfferStatus[];

/** The card's table, restated as a predicate: ONLY PENDING moves, and a
 * decision never targets PENDING itself (no self-transition). */
const isLegalPerCard = (from: OfferStatus, to: OfferStatus): boolean =>
  from === OfferStatus.PENDING && to !== OfferStatus.PENDING;

/** Grabs a synchronous throw instead of try/catch noise in every cell. */
function throwOf(fn: () => void): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('OFFER_TRANSITIONS — the OFR-001 state machine, every (from, to) pair', () => {
  // 6 × 6 = 36 cells: every legal AND illegal move, per the card's acceptance.
  it.each(ALL_STATUSES.flatMap((from) => ALL_STATUSES.map((to) => [from, to] as const)))(
    '%s → %s',
    (from, to) => {
      const legal = isLegalPerCard(from, to);
      expect(canTransition(from, to)).toBe(legal);

      const thrown = throwOf(() => assertTransition(from, to));
      if (legal) {
        expect(thrown).toBeUndefined();
      } else {
        expect(thrown).toBeInstanceOf(ConflictException);
        const body = (thrown as ConflictException).getResponse() as { code?: string };
        expect(body.code).toBe('ILLEGAL_TRANSITION');
      }
    },
  );

  it("gives PENDING exactly the card's five decisions", () => {
    expect([...OFFER_TRANSITIONS[OfferStatus.PENDING]].sort()).toEqual([
      'ACCEPTED',
      'CANCELLED',
      'COUNTERED',
      'EXPIRED',
      'REJECTED',
    ]);
  });

  it('freezes every non-PENDING status (all decisions are terminal)', () => {
    for (const status of ALL_STATUSES.filter((s) => s !== OfferStatus.PENDING)) {
      expect(OFFER_TRANSITIONS[status]).toEqual([]);
    }
  });

  it('covers every Prisma status in the table (no unhandled state)', () => {
    expect(Object.keys(OFFER_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
  });
});

describe('OFFER_STATUS_LABELS_FA', () => {
  it('covers every status with a non-empty fa label', () => {
    expect(Object.keys(OFFER_STATUS_LABELS_FA).sort()).toEqual([...ALL_STATUSES].sort());
    for (const label of Object.values(OFFER_STATUS_LABELS_FA)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('offer bounds constants', () => {
  it("defaults expiry to the card's 72 h", () => {
    expect(OFFER_EXPIRY_DAYS).toBe(3);
  });

  it("bounds the price at the card's 1..2B Toman", () => {
    expect(OFFER_MAX_UNIT_PRICE).toBe(2_000_000_000);
  });

  it("caps the note at the card's 500 chars", () => {
    expect(OFFER_NOTE_MAX_LENGTH).toBe(500);
  });
});
