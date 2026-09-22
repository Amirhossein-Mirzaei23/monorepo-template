import { Module } from '@nestjs/common';
import { AdminOverviewController } from './admin-overview.controller';
import { AdminOverviewRepository } from './admin-overview.repository';
import { AdminOverviewService } from './admin-overview.service';

/**
 * Admin panel module (admin panel Task 04) — currently the read-only workload
 * overview (`GET /admin/overview`, @Roles(ADMIN)). Later admin surfaces
 * (users/lots/reports/…, Tasks 05+) join this module as their own
 * controller → service → repository triads instead of growing the domain
 * modules' public surfaces.
 */
@Module({
  controllers: [AdminOverviewController],
  providers: [AdminOverviewService, AdminOverviewRepository],
})
export class AdminModule {}
