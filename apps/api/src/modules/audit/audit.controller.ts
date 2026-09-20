import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { PaginatedAuditLogsDto } from './dto/audit-response.dto';

@ApiTags('audit')
@ApiBearerAuth('access-token')
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List immutable privileged-action audit records — admin only' })
  @ApiOkResponse({ type: PaginatedAuditLogsDto })
  list(@Query() query: AuditQueryDto): Promise<PaginatedAuditLogsDto> {
    return this.audit.list(query);
  }
}
