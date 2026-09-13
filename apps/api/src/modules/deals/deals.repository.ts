import { Injectable } from '@nestjs/common';
import { DealStatus, type Deal, type DealEvent, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Paginated } from '../../common/dto/pagination-query.dto';
import type { DealResponseRow } from './dto/deal-response.dto';

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
   * findByCode + the lot summary joined (DEAL-003): the transition endpoints
   * answer with the full DealResponseDto, whose allowlist carries the lot
   * {code, title} block — one read instead of a second lot lookup. The bare
   * findByCode stays for callers that do not render the deal (the create
   * path already holds the lot).
   */
  async findByCodeWithLot(code: string, tx: Tx = undefined): Promise<DealResponseRow | null> {
    return this.client(tx).deal.findUnique({
      where: { code },
      include: { lot: { select: { code: true, title: true } } },
    });
  }

  /**
   * DEAL-004 — the role-aware page reads behind GET /deals (the offers
   * findForBuyer/findForSeller pair, mirrored): buyerId/sellerId arm +
   * optional status chip, served by the (buyerId, updatedAt) /
   * (sellerId, updatedAt) plan indexes. Rows come back with the lot summary
   * joined for the response mapper.
   */
  async findForBuyer(
    buyerId: string,
    { status, page = 1, limit = 20 }: { status?: DealStatus; page?: number; limit?: number },
    tx: Tx = undefined,
  ): Promise<Paginated<DealResponseRow>> {
    return this.findPage(
      { buyerId, ...(status !== undefined ? { status } : {}) },
      { page, limit },
      tx,
    );
  }

  async findForSeller(
    sellerId: string,
    { status, page = 1, limit = 20 }: { status?: DealStatus; page?: number; limit?: number },
    tx: Tx = undefined,
  ): Promise<Paginated<DealResponseRow>> {
    return this.findPage(
      { sellerId, ...(status !== undefined ? { status } : {}) },
      { page, limit },
      tx,
    );
  }

  /**
   * The shared 2-query page read (findMany + count): most-recent-activity
   * first (updatedAt desc — a deal you just moved jumps to the top) with id
   * desc as the deterministic tiebreak.
   */
  private async findPage(
    where: Prisma.DealWhereInput,
    { page, limit }: { page: number; limit: number },
    tx: Tx = undefined,
  ): Promise<Paginated<DealResponseRow>> {
    const client = this.client(tx);
    const [items, total] = await Promise.all([
      client.deal.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { lot: { select: { code: true, title: true } } },
      }),
      client.deal.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /**
   * The GUARDED transition write (DEAL-003): ONE conditional updateMany over
   * (id, status = fromStatus) — plan §12's never-read-modify-write shape. The
   * service asserts the matrix BEFORE this call, but its row was read outside
   * the transaction: a concurrent move (both parties cancelling at once, a
   * cancel racing a stage advance) makes the count 0, and the caller answers
   * 409 instead of double-applying a move — the quantity-restore invariant
   * ("a double-restore is unreachable") leans on this predicate. Returns the
   * matched-row count; the refreshed row is read back in the same transaction
   * (the write's row lock holds until commit).
   */
  async updateIfStatus(
    id: string,
    fromStatus: DealStatus,
    data: Prisma.DealUncheckedUpdateInput,
    tx: Tx = undefined,
  ): Promise<number> {
    const result = await this.client(tx).deal.updateMany({
      where: { id, status: fromStatus },
      data,
    });
    return result.count;
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

  /**
   * DEAL-003 payment-confirm write: ONE conditional updateMany (plan §12 —
   * never read-modify-write) over the whole precondition (live row, still
   * PAYMENT_PENDING, not yet marked), so two concurrent «پرداخت کردم» marks
   * cannot both append the announcement event. 0 matched rows means the
   * precondition is gone — the CALLER re-reads to name which one (already
   * marked vs left the stage). Data access only; the status decision was the
   * service's.
   */
  async markPaymentConfirmed(id: string, at: Date, tx: Tx = undefined): Promise<number> {
    const result = await this.client(tx).deal.updateMany({
      where: { id, status: DealStatus.PAYMENT_PENDING, paidConfirmedByBuyerAt: null },
      data: { paidConfirmedByBuyerAt: at },
    });
    return result.count;
  }
}
