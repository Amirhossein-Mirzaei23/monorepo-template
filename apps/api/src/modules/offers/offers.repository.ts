import { Injectable } from '@nestjs/common';
import { OfferStatus, Prisma, type Offer } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Paginated } from '../../common/dto/pagination-query.dto';
import { OFFER_MAX_CHAIN_DEPTH } from './offers.constants';

type Tx = Prisma.TransactionClient | undefined;

/**
 * The lot summary every OfferResponseDto carries (OFR-002 allowlist: lot
 * {code, title, unitPrice}) — the ONLY join the offer reads need; the mapper
 * keeps the payload allowlisted from there. Offers never expose buyerId /
 * sellerId / internal lot ids in list payloads.
 */
export const OFFER_LIST_INCLUDE = {
  lot: { select: { code: true, title: true, unitPrice: true } },
} satisfies Prisma.OfferInclude;

/** An Offer row as the list reads produce it (lot summary joined). */
export type OfferListRow = Prisma.OfferGetPayload<{ include: typeof OFFER_LIST_INCLUDE }>;

/**
 * Data access only. Every method accepts an optional transaction client so the
 * repository stays unit-of-work agnostic — services own transaction boundaries
 * (doc/CONVENTIONS.md → Transactions). Repositories never call $transaction.
 *
 * Surface: create / findById / update (status transitions) / findSiblingsPending /
 * findChain (OFR-001) + the OFR-002 role-scoped paginated listings
 * (findForBuyer / findForSeller / findForLot, lot summary joined for the
 * response mapper). Single-row reads return the bare row — only the LIST page
 * joins the lot summary the response DTO carries.
 */
@Injectable()
export class OffersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx: Tx): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  /**
   * Unchecked variant: callers (OffersService) set FKs as raw ids
   * (`lotId`, `parentId: …`) — relation-object syntax is never needed because
   * the service validates rows, not links.
   */
  async create(data: Prisma.OfferUncheckedCreateInput, tx: Tx = undefined): Promise<Offer> {
    return this.client(tx).offer.create({ data });
  }

  async findById(id: string, tx: Tx = undefined): Promise<Offer | null> {
    return this.client(tx).offer.findUnique({ where: { id } });
  }

  /**
   * Status transitions and nothing else today — the service asserts the move
   * against OFFER_TRANSITIONS BEFORE calling this; the repository does not
   * guard (data access only).
   */
  async update(
    id: string,
    data: Prisma.OfferUncheckedUpdateInput,
    tx: Tx = undefined,
  ): Promise<Offer> {
    return this.client(tx).offer.update({ where: { id }, data });
  }

  /**
   * Sibling pending offers: same lot, same buyer, still PENDING, excluding one
   * offer (the accepted/countered one). The accept side (OFR-002) passes the
   * offer being accepted; `invalidateSiblings` flips the result to REJECTED.
   * Served by the (lotId, buyerId, createdAt) plan index.
   */
  async findSiblingsPending(
    lotId: string,
    buyerId: string,
    exceptOfferId: string,
    tx: Tx = undefined,
  ): Promise<Offer[]> {
    return this.client(tx).offer.findMany({
      where: { lotId, buyerId, status: OfferStatus.PENDING, id: { not: exceptOfferId } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * The counter chain containing `offerId`, walked THROUGH PARENTS (card:
   * "walk parents for context"), oldest first, ending at the requested offer.
   * The chain head (the live offer) is the LAST element when called on the
   * newest row — OFR-002 resolves the timeline from this. Walk is bounded by
   * OFFER_MAX_CHAIN_DEPTH (cycle guard — past it the partial tail is
   * returned); a missing offer id yields [].
   */
  async findChain(offerId: string, tx: Tx = undefined): Promise<Offer[]> {
    const chain: Offer[] = [];
    let cursor = await this.findById(offerId, tx);
    for (let depth = 0; cursor !== null && depth < OFFER_MAX_CHAIN_DEPTH; depth += 1) {
      chain.unshift(cursor);
      cursor = cursor.parentId === null ? null : await this.findById(cursor.parentId, tx);
    }
    return chain;
  }

  // --- OFR-002 — role-scoped paginated listings (GET /offers, GET /lots/:lotId/offers) ---

  /**
   * The caller's offers as the BUYER side (GET /offers?role=buyer), one
   * optional status tab, newest first. Served by the (lotId, buyerId,
   * createdAt) / (status, expiresAt) plan indexes.
   */
  async findForBuyer(
    buyerId: string,
    { status, page = 1, limit = 20 }: { status?: OfferStatus; page?: number; limit?: number },
    tx: Tx = undefined,
  ): Promise<Paginated<OfferListRow>> {
    return this.findPage(
      { buyerId, ...(status !== undefined ? { status } : {}) },
      { page, limit },
      tx,
    );
  }

  /**
   * Offers on the caller's lots (GET /offers?role=seller) — the DENORMALIZED
   * sellerId column (copied from the lot at create) keeps this a plain
   * indexed lookup, same as Conversation.sellerId. Served by the (sellerId,
   * status) plan index.
   */
  async findForSeller(
    sellerId: string,
    { status, page = 1, limit = 20 }: { status?: OfferStatus; page?: number; limit?: number },
    tx: Tx = undefined,
  ): Promise<Paginated<OfferListRow>> {
    return this.findPage(
      { sellerId, ...(status !== undefined ? { status } : {}) },
      { page, limit },
      tx,
    );
  }

  /**
   * Every offer on ONE lot (GET /lots/:lotId/offers, seller-only upstream) —
   * newest first, no status narrowing (the seller view is the lot's full
   * negotiation history). Served by the (lotId, buyerId, createdAt) index.
   */
  async findForLot(
    lotId: string,
    { page = 1, limit = 20 }: { page?: number; limit?: number },
    tx: Tx = undefined,
  ): Promise<Paginated<OfferListRow>> {
    return this.findPage({ lotId }, { page, limit }, tx);
  }

  /**
   * The shared 2-query page read (findMany + count, the app's pagination
   * contract): newest first with id desc as the deterministic tiebreak
   * (createdAt can tie across offers — pages must never duplicate/skip rows).
   * Rows come back with the OFFER_LIST_INCLUDE lot summary for the mapper.
   */
  private async findPage(
    where: Prisma.OfferWhereInput,
    { page, limit }: { page: number; limit: number },
    tx: Tx = undefined,
  ): Promise<Paginated<OfferListRow>> {
    const client = this.client(tx);
    const [items, total] = await Promise.all([
      client.offer.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: OFFER_LIST_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
      }),
      client.offer.count({ where }),
    ]);
    return { items, total, page, limit };
  }
}
