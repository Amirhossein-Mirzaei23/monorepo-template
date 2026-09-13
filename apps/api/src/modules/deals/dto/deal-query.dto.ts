import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DealStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { DEAL_MY_ROLES } from './deal-response.dto';

/**
 * Query params for GET /deals (DEAL-004's lists). ROLE-AWARE like GET /offers:
 * `role` (required) picks the caller's side — `buyer` = deals I struck as the
 * buyer (خرید), `seller` = deals on my lots (فروش). No "both sides" mode — the
 * payload `myRole` and the scope must never disagree. `status` is the
 * chip-filter of the DEAL-004 list page (omitted = every status). Like
 * OfferListQueryDto, the inherited `sort` param is intentionally NOT honoured
 * — the card mandates most-recent-activity first (updatedAt desc) for both
 * lists.
 */
export class DealListQueryDto extends PaginationQueryDto {
  @ApiProperty({
    enum: DEAL_MY_ROLES,
    description:
      'Which side of the deal to list — buyer: deals I made as the buyer; seller: deals on my lots',
  })
  @IsIn(DEAL_MY_ROLES, { message: 'role must be one of: ' + DEAL_MY_ROLES.join(', ') })
  role!: (typeof DEAL_MY_ROLES)[number];

  @ApiPropertyOptional({
    enum: DealStatus,
    description: 'Optional single-status chip filter (omitted = every status)',
  })
  @IsOptional()
  @IsEnum(DealStatus, {
    message: 'status must be one of: ' + Object.values(DealStatus).join(', '),
  })
  status?: DealStatus;
}
