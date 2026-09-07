import { Injectable } from '@nestjs/common';
import { OfferStatus, Prisma, type Offer } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OFFER_MAX_CHAIN_DEPTH } from './offers.constants';

type Tx = Prisma.TransactionClient | undefined;

/**
 * Data access only. Every method accepts an optional transaction client so the
 * repository stays unit-of-work agnostic — services own transaction boundaries
 * (doc/CONVENTIONS.md → Transactions). Repositories never call $transaction.
 *
 * Deliberately narrow (OFR-001 has no endpoints yet — OFR-002 will extend it):
 * create / findById / update (status transitions) / findSiblingsPending /
 * findChain. Reads return the bare row — no response-shaped includes exist
 * until there are response DTOs to feed.
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
}
