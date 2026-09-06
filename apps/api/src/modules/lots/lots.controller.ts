import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
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
 * Owner-scoped lot endpoints (LOT-002 create/edit + LOT-003 lifecycle
 * actions). The global JwtAuthGuard authenticates; the seller hat and
 * ownership are business rules asserted in LotsService (403 SELLER_REQUIRED /
 * 403 non-owner / 404 missing / 409 ILLEGAL_STATUS_EDIT on PATCH, 409
 * ILLEGAL_TRANSITION (+ EXPIRED on a stale resume) on the action routes).
 * Every route returns the OWNER response shape — the public shape is for MKT.
 * LotPublicResponseDto is registered via @ApiExtraModels so the generated
 * contract (gen:types) already carries the public schema no endpoint returns.
 *
 * Status codes: POST /lots and the duplicate action return 201 (they CREATE a
 * row); the other lifecycle actions return 200 with the updated lot's owner
 * body (no 204s — the caller always gets the fresh state back, consistent
 * across the whole controller).
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

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary: 'Submit an owned DRAFT/REJECTED lot for moderation — PENDING_REVIEW, +30d expiry',
  })
  async submit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.submit(user.sub, id);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({ summary: 'Pause an owned ACTIVE lot — hidden from the public listing' })
  async pause(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.pause(user.sub, id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary: 'Resume an owned PAUSED lot — ACTIVE again; 409 EXPIRED if expiresAt already passed',
  })
  async resume(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.resume(user.sub, id);
  }

  @Post(':id/mark-sold')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({ summary: 'Mark an owned ACTIVE/PAUSED lot as SOLD — soldAt=now, availability 0' })
  async markSold(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.markSold(user.sub, id);
  }

  @Post(':id/duplicate')
  @ApiCreatedResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary:
      'Duplicate any non-REMOVED owned lot into a NEW DRAFT — fresh code/expiry, zeroed counters',
  })
  async duplicate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.duplicate(user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LotOwnerResponseDto })
  @ApiOperation({
    summary: 'Soft-delete an owned non-SOLD lot — status REMOVED + deletedAt=now (SOLD → 409)',
  })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<LotOwnerResponseDto> {
    return this.lots.remove(user.sub, id);
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
