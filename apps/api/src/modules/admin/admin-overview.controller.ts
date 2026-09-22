import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminOverviewService } from './admin-overview.service';
import { AdminOverviewResponseDto } from './dto/admin-overview-response.dto';

/**
 * Admin read surface (admin panel Task 04). A separate module — NOT a route on
 * an existing domain controller — because the overview intentionally spans
 * lots/deals/users; each count stays a bounded query in its own repository
 * read, guarded by the global JwtAuthGuard + RolesGuard pair (AppModule).
 * Write surfaces land per-domain later (Tasks 05-12) — this module stays
 * read-only.
 */
@ApiTags('admin')
@ApiBearerAuth('access-token')
@Controller('admin')
export class AdminOverviewController {
  constructor(private readonly adminOverviewService: AdminOverviewService) {}

  @Get('overview')
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: AdminOverviewResponseDto })
  @ApiOperation({
    summary:
      'Operational workload overview (pending lots, disputed deals, user counts, quick queues) — admin only',
  })
  getOverview(): Promise<AdminOverviewResponseDto> {
    return this.adminOverviewService.getOverview();
  }
}
