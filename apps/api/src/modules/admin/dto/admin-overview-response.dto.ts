import { ApiProperty } from '@nestjs/swagger';
import { type Lot, LotStatus } from '@prisma/client';

/**
 * GET /admin/overview — the operational workload payload (admin panel Task 04).
 * Strictly bounded and placeholder-free: every number is a real database count,
 * and the two report/verification surfaces stay at literal zero until their
 * domains exist (reports → Task 09, verifications → Task 10). No GMV/revenue
 * by design — analytics has no defined contract yet.
 */
export class AdminOverviewCountersDto {
  @ApiProperty({ description: 'Lots waiting in the moderation queue' })
  pendingReviewLots!: number;

  @ApiProperty({ description: 'Open user reports — always 0 until Task 09' })
  openReports!: number;

  @ApiProperty({ description: 'Pending verification requests — always 0 until Task 10' })
  pendingVerifications!: number;

  @ApiProperty({ description: 'Deals stuck in the DISPUTED state' })
  disputedDeals!: number;

  @ApiProperty({ description: 'Users with status ACTIVE' })
  activeUsers!: number;

  @ApiProperty({ description: 'Users with status SUSPENDED' })
  suspendedUsers!: number;

  @ApiProperty({ description: 'Users with status BLOCKED' })
  blockedUsers!: number;

  @ApiProperty({
    description: 'Users created within the last 7 days (inclusive window, one server `now`)',
  })
  newUsersLast7Days!: number;
}

/** Minimal pending-lot summary for the quick queue — no evidence/media joins. */
export class AdminOverviewPendingLotDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: '7Kd2Qm9x', description: 'Public non-sequential lot code' })
  code!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: LotStatus })
  status!: LotStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

/**
 * Placeholder contract for the reports queue (Task 09 owns the real shape).
 * Kept to id + createdAt so nothing speculative leaks into the API contract;
 * the array itself stays empty until the reports domain lands.
 */
export class AdminOverviewPendingReportDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class AdminOverviewResponseDto {
  @ApiProperty({ type: AdminOverviewCountersDto })
  counts!: AdminOverviewCountersDto;

  @ApiProperty({
    type: [AdminOverviewPendingLotDto],
    description: 'Five oldest PENDING_REVIEW lots, oldest first',
  })
  oldestPendingLots!: AdminOverviewPendingLotDto[];

  @ApiProperty({
    type: [AdminOverviewPendingReportDto],
    description: 'Five oldest open reports — always empty until Task 09',
  })
  oldestOpenReports!: AdminOverviewPendingReportDto[];
}

/** Minimal projection the queue read selects from the Lot table. */
export type PendingLotSummaryRow = Pick<Lot, 'id' | 'code' | 'title' | 'status' | 'createdAt'>;

export interface OverviewCountersInput {
  pendingReviewLots: number;
  disputedDeals: number;
  activeUsers: number;
  suspendedUsers: number;
  blockedUsers: number;
  newUsersLast7Days: number;
  oldestPendingLots: PendingLotSummaryRow[];
  /** Reserved for Task 09 — no reports table exists yet. */
  oldestOpenReports?: AdminOverviewPendingReportDto[];
}

export function toAdminOverviewResponse(input: OverviewCountersInput): AdminOverviewResponseDto {
  return {
    counts: {
      pendingReviewLots: input.pendingReviewLots,
      // Hardcoded zeros until the domains exist (Task 09 / Task 10) — never a
      // fabricated metric.
      openReports: 0,
      pendingVerifications: 0,
      disputedDeals: input.disputedDeals,
      activeUsers: input.activeUsers,
      suspendedUsers: input.suspendedUsers,
      blockedUsers: input.blockedUsers,
      newUsersLast7Days: input.newUsersLast7Days,
    },
    oldestPendingLots: input.oldestPendingLots.map((lot) => ({
      id: lot.id,
      code: lot.code,
      title: lot.title,
      status: lot.status,
      createdAt: lot.createdAt,
    })),
    oldestOpenReports: input.oldestOpenReports ?? [],
  };
}
