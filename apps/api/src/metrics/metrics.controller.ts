import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import type { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prometheus metrics (text/plain version=0.0.4)' })
  async getMetrics(@Res() response: Response): Promise<void> {
    const payload = await this.metrics.render();
    response.type('text/plain; version=0.0.4').send(payload);
  }
}
