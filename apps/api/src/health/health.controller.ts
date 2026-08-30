import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import type { HealthService, ReadinessReport } from './health.service';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe (process only)' })
  getLiveness(): { status: 'ok'; uptimeSeconds: number } {
    return this.health.getLiveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (checks dependencies)' })
  async getReadiness(): Promise<ReadinessReport> {
    const report = await this.health.getReadiness();
    if (report.status === 'error') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
