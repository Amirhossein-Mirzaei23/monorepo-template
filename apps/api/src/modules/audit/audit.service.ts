import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Paginated } from '../../common/dto/pagination-query.dto';
import { AuditRepository, type AuditTx } from './audit.repository';
import type { AuditQueryDto } from './dto/audit-query.dto';
import { type AuditLogResponseDto, toAuditLogResponse } from './dto/audit-response.dto';

export interface AuditWriteContext {
  actorId: string | null;
  requestId: string;
  ip: string;
}

export type AuditMetadata = Record<
  string,
  string | number | boolean | null | string[] | number[] | boolean[]
>;

export interface WriteAuditInput extends AuditWriteContext {
  action: string;
  entityType: string;
  entityId: string;
  metadata: AuditMetadata;
}

const AUDIT_METADATA_KEYS = new Set([
  'parentId',
  'sortOrder',
  'isActive',
  'changedFields',
  'siblingId',
  // User-management actions (admin panel Task 05): the reason is mandatory on
  // every action and the from/to + revocation counts make the audit row a
  // self-contained history entry.
  'reason',
  'statusAction',
  'fromStatus',
  'toStatus',
  'fromRole',
  'toRole',
  'revokedSessions',
]);

function validateAuditMetadata(metadata: AuditMetadata): void {
  for (const [key, value] of Object.entries(metadata)) {
    const isScalar = value === null || ['string', 'number', 'boolean'].includes(typeof value);
    const isScalarArray =
      Array.isArray(value) &&
      value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item));
    if (!AUDIT_METADATA_KEYS.has(key) || (!isScalar && !isScalarArray)) {
      throw new BadRequestException(`Unsupported audit metadata: ${key}`);
    }
  }
}

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async create(input: WriteAuditInput, tx: AuditTx): Promise<AuditLogResponseDto> {
    validateAuditMetadata(input.metadata);
    const row = await this.repository.create(
      {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata as Prisma.InputJsonObject,
        requestId: input.requestId,
        ip: input.ip,
      },
      tx,
    );
    return toAuditLogResponse(row);
  }

  async list(query: AuditQueryDto): Promise<Paginated<AuditLogResponseDto>> {
    const createdAt =
      query.from === undefined && query.to === undefined
        ? undefined
        : { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) };
    const { items, total } = await this.repository.findMany({
      page: query.page,
      limit: query.limit,
      where: {
        actorId: query.actorId,
        action: query.action,
        entityType: query.entityType,
        entityId: query.entityId,
        createdAt,
      },
    });
    return { items: items.map(toAuditLogResponse), total, page: query.page, limit: query.limit };
  }
}
