import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DealStatus, DeliveryMethod, PaymentMethodRecorded } from '@prisma/client';
import {
  DEAL_COMMISSION_RATE_BASIS_POINTS,
  DEAL_ERROR_CODES,
  DEAL_MAX_TOTAL_PRICE,
  DEAL_MAX_UNIT_PRICE,
  DEAL_MIN_UNIT_PRICE,
  DEAL_NOTE_MAX_LENGTH,
  DEAL_ROLES,
  DEAL_STATUS_LABELS_FA,
  DEAL_TRANSITIONS,
  DELIVERY_METHOD_LABELS_FA,
  PAYMENT_METHOD_LABELS_FA,
  REASON_FIELDS,
  STAGE_TIMESTAMP_FIELDS,
  assertTransition,
  canTransition,
  generateDealCode,
  transitionRuleFor,
  type DealRole,
} from '../deals.constants';

const ALL_STATUSES = Object.values(DealStatus) as DealStatus[];
const ALL_ROLES = DEAL_ROLES;

/**
 * The DEAL-001 card's matrix, restated INDEPENDENTLY of DEAL_TRANSITIONS
 * (hand-copied from the card text, not derived from the code under test —
 * that independence is what makes the 300-cell sweep a real check):
 * `CARD_MATRIX[from][to]` = the roles allowed to move, an absent cell = an
 * illegal move. C = card lines:
 *
 * - C: NEGOTIATING→AGREED (B|S), NEGOTIATING→CANCELLED (B|S w/ reason)
 * - C: AGREED→PAYMENT_PENDING (S|B), AGREED→CANCELLED (B|S)
 * - C: PAYMENT_PENDING→PAID (S confirms), PAYMENT_PENDING→CANCELLED (S)
 * - C: PAID→PREPARING (S)→SHIPPED (S)→DELIVERED (S)→COMPLETED (B confirms)
 * - C: any non-terminal→DISPUTED (B|S w/ reason)
 * - C: DISPUTED resolution → COMPLETED|CANCELLED by ADMIN only
 */
const CARD_MATRIX: Record<DealStatus, Partial<Record<DealStatus, DealRole[]>>> = {
  NEGOTIATING: {
    [DealStatus.AGREED]: ['BUYER', 'SELLER'],
    [DealStatus.CANCELLED]: ['BUYER', 'SELLER'],
    [DealStatus.DISPUTED]: ['BUYER', 'SELLER'],
  },
  AGREED: {
    [DealStatus.PAYMENT_PENDING]: ['SELLER', 'BUYER'],
    [DealStatus.CANCELLED]: ['BUYER', 'SELLER'],
    [DealStatus.DISPUTED]: ['BUYER', 'SELLER'],
  },
  PAYMENT_PENDING: {
    [DealStatus.PAID]: ['SELLER'], // the seller's confirm; the buyer's mark is NOT a transition
    [DealStatus.CANCELLED]: ['SELLER'],
    [DealStatus.DISPUTED]: ['BUYER', 'SELLER'],
  },
  PAID: {
    [DealStatus.PREPARING]: ['SELLER'],
    [DealStatus.DISPUTED]: ['BUYER', 'SELLER'],
  },
  PREPARING: {
    [DealStatus.SHIPPED]: ['SELLER'],
    [DealStatus.DISPUTED]: ['BUYER', 'SELLER'],
  },
  SHIPPED: {
    [DealStatus.DELIVERED]: ['SELLER'],
    [DealStatus.DISPUTED]: ['BUYER', 'SELLER'],
  },
  DELIVERED: {
    [DealStatus.COMPLETED]: ['BUYER'], // buyer confirm; the 7-day auto job is a sweep, not a row
    [DealStatus.DISPUTED]: ['BUYER', 'SELLER'],
  },
  COMPLETED: {}, // terminal
  CANCELLED: {}, // terminal
  DISPUTED: {
    // admin resolution only (DEAL-007 endpoints, P1 — rows per the matrix)
    [DealStatus.COMPLETED]: ['ADMIN'],
    [DealStatus.CANCELLED]: ['ADMIN'],
  },
};

/** Every non-terminal status may → DISPUTED per the card ("any non-terminal"). */
const TERMINAL_STATUSES: DealStatus[] = [
  DealStatus.COMPLETED,
  DealStatus.CANCELLED,
  DealStatus.DISPUTED,
];

/** Grabs a synchronous throw instead of try/catch noise in every cell. */
function throwOf(fn: () => void): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('DEAL_TRANSITIONS — the DEAL-001 state machine, every (from, to, role) cell', () => {
  // 10 × 10 × 3 = 300 cells: every legal move, every role denial, every
  // illegal pair — per the card's acceptance ("full matrix incl. role denials").
  it.each(ALL_STATUSES.flatMap((from) => ALL_STATUSES.map((to) => [from, to] as const)))(
    'from %s to %s — all three hats',
    (from, to) => {
      const allowedRoles = CARD_MATRIX[from][to] ?? [];
      for (const role of ALL_ROLES) {
        const legal = allowedRoles.includes(role);
        expect(canTransition(from, to, role)).toBe(legal);

        const thrown = throwOf(() => assertTransition(from, to, role));
        if (legal) {
          expect(thrown).toBeUndefined();
        } else if (allowedRoles.length === 0) {
          // The move does not exist → 409, regardless of the hat.
          expect(thrown).toBeInstanceOf(ConflictException);
          const body = (thrown as ConflictException).getResponse() as { code?: string };
          expect(body.code).toBe(DEAL_ERROR_CODES.ILLEGAL_TRANSITION);
        } else {
          // The move exists but this hat may not perform it → 403.
          expect(thrown).toBeInstanceOf(ForbiddenException);
          const body = (thrown as ForbiddenException).getResponse() as { code?: string };
          expect(body.code).toBe(DEAL_ERROR_CODES.TRANSITION_ROLE_FORBIDDEN);
        }
      }
    },
  );

  it('exposes exactly the card matrix (no extra moves, none missing)', () => {
    for (const from of ALL_STATUSES) {
      const expectedTargets = Object.keys(CARD_MATRIX[from]) as DealStatus[];
      expect(DEAL_TRANSITIONS[from].map((rule) => rule.to)).toEqual(expectedTargets);
      for (const rule of DEAL_TRANSITIONS[from]) {
        // Order-insensitive: the card's "(B|S)" vs "(S|B)" is the same grant.
        expect([...rule.roles].sort()).toEqual([...(CARD_MATRIX[from][rule.to] ?? [])].sort());
      }
    }
  });

  it('never allows a self-transition', () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status, 'ADMIN')).toBe(false);
      expect(transitionRuleFor(status, status)).toBeUndefined();
    }
  });

  it('freezes the terminal states (COMPLETED, CANCELLED) for everyone', () => {
    for (const status of TERMINAL_STATUSES.filter((s) => s !== DealStatus.DISPUTED)) {
      expect(DEAL_TRANSITIONS[status]).toEqual([]);
    }
  });

  it('lets every non-terminal status dispute (B|S) and nothing else dispute into DISPUTED rows', () => {
    for (const from of ALL_STATUSES.filter((s) => !TERMINAL_STATUSES.includes(s))) {
      const dispute = transitionRuleFor(from, DealStatus.DISPUTED);
      expect(dispute).toBeDefined();
      expect([...(dispute?.roles ?? [])]).toEqual(['BUYER', 'SELLER']);
    }
  });

  it('requires a reason exactly for →CANCELLED and →DISPUTED rows', () => {
    for (const from of ALL_STATUSES) {
      for (const rule of DEAL_TRANSITIONS[from]) {
        const shouldRequire = rule.to === DealStatus.CANCELLED || rule.to === DealStatus.DISPUTED;
        expect(rule.requiresReason).toBe(shouldRequire);
      }
    }
  });

  it('covers every Prisma status in the table (no unhandled state)', () => {
    expect(Object.keys(DEAL_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
  });
});

describe('STAGE_TIMESTAMP_FIELDS / REASON_FIELDS — the write-side maps', () => {
  it('maps each transitioned stage to its stamp column', () => {
    expect(STAGE_TIMESTAMP_FIELDS[DealStatus.NEGOTIATING]).toBeNull(); // createdAt covers it
    expect(STAGE_TIMESTAMP_FIELDS[DealStatus.AGREED]).toBe('agreedAt');
    expect(STAGE_TIMESTAMP_FIELDS[DealStatus.PAYMENT_PENDING]).toBe('paymentPendingAt');
    expect(STAGE_TIMESTAMP_FIELDS[DealStatus.PAID]).toBe('paidAt');
    expect(STAGE_TIMESTAMP_FIELDS[DealStatus.PREPARING]).toBe('preparingAt');
    expect(STAGE_TIMESTAMP_FIELDS[DealStatus.SHIPPED]).toBe('shippedAt');
    expect(STAGE_TIMESTAMP_FIELDS[DealStatus.DELIVERED]).toBe('deliveredAt');
    expect(STAGE_TIMESTAMP_FIELDS[DealStatus.COMPLETED]).toBe('completedAt');
    expect(STAGE_TIMESTAMP_FIELDS[DealStatus.CANCELLED]).toBeNull(); // cancelReason carries it
    expect(STAGE_TIMESTAMP_FIELDS[DealStatus.DISPUTED]).toBeNull(); // disputeReason carries it
  });

  it('covers every status in both maps', () => {
    expect(Object.keys(STAGE_TIMESTAMP_FIELDS).sort()).toEqual([...ALL_STATUSES].sort());
    expect(Object.keys(REASON_FIELDS).sort()).toEqual([...ALL_STATUSES].sort());
    expect(REASON_FIELDS[DealStatus.CANCELLED]).toBe('cancelReason');
    expect(REASON_FIELDS[DealStatus.DISPUTED]).toBe('disputeReason');
  });
});

describe('fa labels (the one source the web renders through generated types)', () => {
  it('covers every status / delivery method / payment method with non-empty fa labels', () => {
    expect(Object.keys(DEAL_STATUS_LABELS_FA).sort()).toEqual([...ALL_STATUSES].sort());
    expect(Object.keys(DELIVERY_METHOD_LABELS_FA).sort()).toEqual(
      (Object.values(DeliveryMethod) as string[]).sort(),
    );
    expect(Object.keys(PAYMENT_METHOD_LABELS_FA).sort()).toEqual(
      (Object.values(PaymentMethodRecorded) as string[]).sort(),
    );
    for (const label of [
      ...Object.values(DEAL_STATUS_LABELS_FA),
      ...Object.values(DELIVERY_METHOD_LABELS_FA),
      ...Object.values(PAYMENT_METHOD_LABELS_FA),
    ]) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe('generateDealCode — the public id (8 base62 chars, like lots)', () => {
  const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  it('produces 8 base62 characters', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateDealCode();
      expect(code).toHaveLength(8);
      for (const char of code) {
        expect(BASE62).toContain(char);
      }
    }
  });

  it('does not repeat codes across draws (the collision retry budget)', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      codes.add(generateDealCode());
    }
    expect(codes.size).toBe(200);
  });
});

describe('bounds + reserved commission constants', () => {
  it("keeps the money bounds at the card's 1..2B Toman (mirrored from offers)", () => {
    expect(DEAL_MIN_UNIT_PRICE).toBe(1);
    expect(DEAL_MAX_UNIT_PRICE).toBe(2_000_000_000);
    expect(DEAL_MAX_TOTAL_PRICE).toBe(2_000_000_000);
  });

  it("caps the free-text notes at the offers' 500 chars", () => {
    expect(DEAL_NOTE_MAX_LENGTH).toBe(500);
  });

  it('reserves commission at 0 for the MVP (basis points, DEAL-006 turns the dial)', () => {
    expect(DEAL_COMMISSION_RATE_BASIS_POINTS).toBe(0);
  });
});
