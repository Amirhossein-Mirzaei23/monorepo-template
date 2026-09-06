import { ApiPropertyOptional } from '@nestjs/swagger';
import { LotStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * Query params for GET /lots/mine (LOT-005) — extends the shared pagination
 * contract with ONE optional status filter (the seller dashboard tabs). The
 * inherited `sort` param is intentionally NOT honoured here: the inventory is
 * always newest-first (createdAt desc), a fixed order the card mandates.
 */
export class MyLotsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: LotStatus,
    description: 'Optional single-status tab filter (omitted = every non-REMOVED status)',
  })
  @IsOptional()
  @IsEnum(LotStatus, { message: 'status must be one of: ' + Object.values(LotStatus).join(', ') })
  status?: LotStatus;
}
