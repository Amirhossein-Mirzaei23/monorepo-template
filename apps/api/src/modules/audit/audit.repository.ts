import { Injectable } from '@nestjs/common';
import type { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AuditTx = Prisma.TransactionClient | undefined;

export interface ListAuditParams {
  page: number;
  limit: number;
  where?: Prisma.AuditLogWhereInput;
}

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx: AuditTx): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.AuditLogUncheckedCreateInput, tx: AuditTx): Promise<AuditLog> {
    return this.client(tx).auditLog.create({ data });
  }

  async findMany(
    { page, limit, where }: ListAuditParams,
    tx: AuditTx = undefined,
  ): Promise<{ items: AuditLog[]; total: number }> {
    const client = this.client(tx);
    const [items, total] = await Promise.all([
      client.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      client.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}
