import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type CheckStatus = 'up' | 'down';

export interface ReadinessReport {
  status: 'ok' | 'error';
  checks: { database: CheckStatus };
  uptimeSeconds: number;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: is the process alive — never touches dependencies. */
  getLiveness(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /** Readiness: are dependencies reachable — reports degraded instead of throwing. */
  async getReadiness(): Promise<ReadinessReport> {
    let database: CheckStatus = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'error',
      checks: { database },
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
