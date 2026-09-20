import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AuditLog, Prisma } from '@prisma/client';

export class AuditLogResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  actorId!: string | null;

  @ApiProperty({ example: 'category.update' })
  action!: string;

  @ApiProperty({ example: 'Category' })
  entityType!: string;

  @ApiProperty()
  entityId!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  metadata!: Prisma.JsonValue;

  @ApiProperty()
  requestId!: string;

  @ApiProperty()
  ip!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class PaginatedAuditLogsDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  items!: AuditLogResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}

export function toAuditLogResponse(row: AuditLog): AuditLogResponseDto {
  return {
    id: row.id,
    actorId: row.actorId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: row.metadata,
    requestId: row.requestId,
    ip: row.ip,
    createdAt: row.createdAt,
  };
}
