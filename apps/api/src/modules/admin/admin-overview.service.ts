import { Injectable } from '@nestjs/common';
import { DealStatus, LotStatus, UserStatus } from '@prisma/client';
import {
  AdminOverviewResponseDto,
  toAdminOverviewResponse,
} from './dto/admin-overview-response.dto';
import { AdminOverviewRepository } from './admin-overview.repository';

/** Quick-queue depth — the task card's bounded "five oldest". */
const OVERVIEW_QUEUE_SIZE = 5;
/** The new-users window (plan §3 semantics: inclusive 7×24h lookback). */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Business read for the admin overview. Owns the ONE `now` the whole read is
 * anchored on (passed down to every windowed repository query — no `new Date()`
 * scattered through queries) and composes the bounded repository reads into
 * the response DTO. Reports (Task 09) and verifications (Task 10) stay
 * hardcoded zeros here until their domains exist — no placeholder metrics.
 */
@Injectable()
export class AdminOverviewService {
  constructor(private readonly repository: AdminOverviewRepository) {}

  async getOverview(): Promise<AdminOverviewResponseDto> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - SEVEN_DAYS_MS);

    const [
      pendingReviewLots,
      disputedDeals,
      activeUsers,
      suspendedUsers,
      blockedUsers,
      newUsersLast7Days,
      oldestPendingLots,
    ] = await Promise.all([
      this.repository.countLotsByStatus(LotStatus.PENDING_REVIEW),
      this.repository.countDealsByStatus(DealStatus.DISPUTED),
      this.repository.countUsersByStatus(UserStatus.ACTIVE),
      this.repository.countUsersByStatus(UserStatus.SUSPENDED),
      this.repository.countUsersByStatus(UserStatus.BLOCKED),
      this.repository.countUsersCreatedSince(weekAgo),
      this.repository.findOldestLotsByStatus(LotStatus.PENDING_REVIEW, OVERVIEW_QUEUE_SIZE),
    ]);

    return toAdminOverviewResponse({
      pendingReviewLots,
      disputedDeals,
      activeUsers,
      suspendedUsers,
      blockedUsers,
      newUsersLast7Days,
      oldestPendingLots,
    });
  }
}
