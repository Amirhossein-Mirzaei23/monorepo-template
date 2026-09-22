import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminOverviewController } from './admin-overview.controller';
import { AdminOverviewRepository } from './admin-overview.repository';
import { AdminOverviewService } from './admin-overview.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersRepository } from './admin-users.repository';
import { AdminUsersService } from './admin-users.service';

/**
 * Admin panel module — the admin-only surfaces that span or harden domains.
 * Task 04 added the read-only workload overview (`GET /admin/overview`);
 * Task 05 adds the canonical safe user-management triad (`/admin/users`:
 * search, allowlisted detail, narrow status/role/session actions with the
 * self-action and last-active-admin guards, same-transaction session
 * revocation and audit). AuditService joins the module so every privileged
 * write appends its row inside the action's own transaction.
 */
@Module({
  imports: [AuditModule],
  controllers: [AdminOverviewController, AdminUsersController],
  providers: [
    AdminOverviewService,
    AdminOverviewRepository,
    AdminUsersService,
    AdminUsersRepository,
  ],
})
export class AdminModule {}
