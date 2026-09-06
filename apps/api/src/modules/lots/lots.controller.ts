import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateLotDto } from './dto/create-lot.dto';
import { LotOwnerResponseDto, LotPublicResponseDto } from './dto/lot-response.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { LotsService } from './lots.service';

/**
 * Owner-scoped lot endpoints (LOT-002). The global JwtAuthGuard authenticates;
 * the seller hat and ownership are business rules asserted in LotsService
 * (403 SELLER_REQUIRED / 403 non-owner / 404 missing / 409 ILLEGAL_STATUS_EDIT).
 * Both routes return the OWNER response shape — the public shape is for MKT.
 * LotPublicResponseDto is registered via @ApiExtraModels so the generated
 * contract (gen:types) already carries the public schema no endpoint returns yet.
 */
@ApiTags('lots')
@ApiBearerAuth('access-token')
@ApiExtraModels(LotPublicResponseDto)
@Controller('lots')
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  @Post()
  @ApiCreatedResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary:
      'Create a lot as the seller — submit=false (default) saves a DRAFT, submit=true submits for moderation',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLotDto,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.create(user.sub, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary:
      'Edit an owned lot — DRAFT/REJECTED fully editable (submit=true resubmits); ACTIVE/PAUSED only price/quantity fields; otherwise 409',
  })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLotDto,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.update(user.sub, id, dto);
  }
}
