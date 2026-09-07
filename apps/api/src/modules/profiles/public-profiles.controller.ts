import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ListSellersQueryDto } from './dto/list-sellers-query.dto';
import { PublicSellerListDto } from './dto/public-seller.dto';
import { PublicSellerProfileDto } from './dto/public-seller-profile.dto';
import { ProfilesService } from './profiles.service';

/**
 * Public profile reads (starts with MKT-004) — the @Public counterparts to the
 * authenticated own-profile controller in this module, exactly as its class
 * doc anticipated ("public seller/buyer profiles arrive as separate
 * controllers/routes"). A separate controller keeps the guard story explicit:
 * the global JwtAuthGuard guards ProfilesController; every route here is
 * anonymous. The full public seller/buyer profile pages (/s/{id}) arrive with
 * PROF-002 as additional routes here.
 */
@ApiTags('profiles')
@Controller('profiles')
export class PublicProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('sellers')
  @Public()
  @ApiOkResponse({
    type: PublicSellerListDto,
    description:
      '{ items: PublicSellerSummaryDto[] } — newest seller profiles, plain list (no pagination envelope). verified=true returns an empty list until TRS-001 lands verification',
  })
  @ApiOperation({
    summary:
      'Public sellers listing (no auth) — home «تأییدشده‌ها» strip source; ?verified=true filters to verified sellers, ?limit caps at 20',
  })
  async sellers(@Query() query: ListSellersQueryDto): Promise<PublicSellerListDto> {
    return this.profiles.findPublicSellers(query);
  }

  /**
   * PROF-002 — the public seller profile page payload. Declared AFTER the
   * `sellers` collection route (two segments — no route shadowing either way).
   * Any validation miss (unknown profile id / no SELLER role / user not
   * ACTIVE) is one uniform 404 with no oracle — see ProfilesService.
   */
  @Get('sellers/:id')
  @Public()
  @ApiOkResponse({
    type: PublicSellerProfileDto,
    description:
      'Public seller profile: identity + bio + fa location labels + trust placeholders (verified=false until TRS-001, badges=[] until TRS-002, metrics zeros/nulls until PROF-005) + category chips + Paginated active (12) and sold (4) MKT-001 card envelopes. 404 unless the profile exists, the user holds the SELLER role and is ACTIVE',
  })
  @ApiOperation({
    summary:
      'Public seller profile page (no auth) — /s/{id} source; :id is the PROFILE id from the sellers listing',
  })
  async sellerProfile(@Param('id') id: string): Promise<PublicSellerProfileDto> {
    return this.profiles.getSellerPublicProfile(id);
  }
}
