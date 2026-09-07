import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ListSellersQueryDto } from './dto/list-sellers-query.dto';
import { PublicSellerListDto } from './dto/public-seller.dto';
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
}
