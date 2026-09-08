import { Injectable } from '@nestjs/common';
import type { Deal, DealEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Tx = Prisma.TransactionClient | undefined;

/** The pair `create` persists atomically: the deal row + its CREATION event
 * (fromStatus = toStatus = NEGOTIATING) — the timeline must be total, every
 * deal is born with ≥ 1 event. The event's dealId is stamped here from the
 * created row, so the caller cannot pass a mismatched one. */
export interface CreateDealArgs {
  deal: Prisma.DealUncheckedCreateInput;
  event: Omit<Prisma.DealEventUncheckedCreateInput, 'dealId'>;
}

/**
 * Data access only. Every method accepts an optional transaction client so
 * the repository stays unit-of-work agnostic — services own transaction
 * boundaries (doc/CONVENTIONS.md → Transactions). Repositories never call
 * $transaction.
 *
 * Surface: create (deal + creation event in one client) / findById /
 * findByCode (the public URL id, DEAL-002/003's handle) / update (status
 * transitions + stage stamps) / appendEvent + findEvents (the timeline,
 * DEAL-001's auditability half). Single-row reads return the bare row — no
 * joins until a response DTO needs them (DEAL-002 owns payloads).
 */
@Injectable()
export class DealsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx: Tx): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  /**
   * Unchecked variant: callers (DealsService) set FKs as raw ids (`lotId`,
   * `buyerId`, `offerId`, …) — relation-object syntax is never needed because
   * the service validates rows, not links. The event insert runs through the
   * SAME client as the deal insert: inside the caller's tx they commit or
   * roll back together.
   */
  async create({ deal, event }: CreateDealArgs, tx: Tx = undefined): Promise<Deal> {
    const created = await this.client(tx).deal.create({ data: deal });
    await this.client(tx).dealEvent.create({
      data: { ...event, dealId: created.id },
    });
    return created;
  }

  async findById(id: string, tx: Tx = undefined): Promise<Deal | null> {
    return this.client(tx).deal.findUnique({ where: { id } });
  }

  /** The public handle (plan §3 unique code) — served by the unique index. */
  async findByCode(code: string, tx: Tx = undefined): Promise<Deal | null> {
    return this.client(tx).deal.findUnique({ where: { code } });
  }

  /**
   * Status transitions (status + stage stamp + reason column) and nothing
   * else today — the service asserts the move against DEAL_TRANSITIONS
   * BEFORE calling this; the repository does not guard (data access only).
   */
  async update(
    id: string,
    data: Prisma.DealUncheckedUpdateInput,
    tx: Tx = undefined,
  ): Promise<Deal> {
    return this.client(tx).deal.update({ where: { id }, data });
  }

  /** The timeline append — always paired with the status write in one tx
   * (DealsService.transition owns that pairing). */
  async appendEvent(
    data: Prisma.DealEventUncheckedCreateInput,
    tx: Tx = undefined,
  ): Promise<DealEvent> {
    return this.client(tx).dealEvent.create({ data });
  }

  /** The full timeline of one deal, oldest first (the (dealId, createdAt)
   * plan index), id asc as the deterministic tiebreak for equal stamps. */
  async findEvents(dealId: string, tx: Tx = undefined): Promise<DealEvent[]> {
    return this.client(tx).dealEvent.findMany({
      where: { dealId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }
}
