import { Injectable } from '@nestjs/common';
import type { DealStatus, LotStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PendingLotSummaryRow } from './dto/admin-overview-response.dto';

/**
 * Data access for the admin overview (Task 04). Read-only and strictly
 * bounded: every query is either an indexed `count` or a `take`-capped,
 * minimal-`select` page read — no unbounded row loads, no aggregates beyond
 * counts. Reads need no transaction (doc/CONVENTIONS.md → Transactions), so
 * unlike the write repositories this one takes no tx client.
 *
 * Index usage (apps/api/prisma/schema.prisma):
 * - Lot count + queue → `@@index([status, createdAt])`
 * - Deal count        → `@@index([status])`
 * - User counts       → `@@index([status])`; the 7-day window scans createdAt
 *   unindexed (bounded work: one indexless count — acceptable at MVP scale;
 *   TODO(admin): add `@@index([createdAt])` in a later migration as users grow).
 */
@Injectable()
export class AdminOverviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  countLotsByStatus(status: LotStatus): Promise<number> {
    // `deletedAt: null` mirrors the other status-filtered lot reads (LOT-003
    // already pairs REMOVED with deletedAt — this is belt-and-suspenders).
    return this.prisma.lot.count({ where: { status, deletedAt: null } });
  }

  countDealsByStatus(status: DealStatus): Promise<number> {
    return this.prisma.deal.count({ where: { status } });
  }

  countUsersByStatus(status: UserStatus): Promise<number> {
    return this.prisma.user.count({ where: { status } });
  }

  /** Inclusive lower bound (`createdAt >= since`) — pinned by the service spec. */
  countUsersCreatedSince(since: Date): Promise<number> {
    return this.prisma.user.count({ where: { createdAt: { gte: since } } });
  }

  /** The `take`-capped oldest-first quick-queue page, minimal fields only. */
  findOldestLotsByStatus(status: LotStatus, take: number): Promise<PendingLotSummaryRow[]> {
    return this.prisma.lot.findMany({
      where: { status, deletedAt: null },
      // `id` tiebreak keeps equal-timestamp rows deterministic (audit list precedent).
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        createdAt: true,
      },
    });
  }
}
