import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { SaveOnboardingDto } from './dto/save-onboarding.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfilesService } from './profiles.service';

/**
 * Own-profile endpoints (ONB-001 + PROF-001) — authenticated by the global
 * JwtAuthGuard. Public seller/buyer profiles (PROF-002/003) arrive as separate
 * controllers/routes in this module.
 */
@ApiTags('profiles')
@ApiBearerAuth('access-token')
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Put('onboarding')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiOperation({
    summary: 'Submit onboarding — creates or idempotently updates the profile in one transaction',
  })
  async submitOnboarding(
    @CurrentUser() user: AuthUser,
    @Body() dto: SaveOnboardingDto,
  ): Promise<ProfileResponseDto> {
    return this.profiles.submitOnboarding(user.sub, dto);
  }

  @Get('me')
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiOperation({
    summary: 'Own profile with interests, trust placeholders and metrics (404 before onboarding)',
  })
  async me(@CurrentUser() user: AuthUser): Promise<ProfileResponseDto> {
    return this.profiles.getMyProfile(user.sub);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ProfileResponseDto })
  @ApiOperation({
    summary:
      'Partially update the own profile — absent fields untouched; roles add-only (never removed)',
  })
  async updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.profiles.updateMyProfile(user.sub, dto);
  }
}
