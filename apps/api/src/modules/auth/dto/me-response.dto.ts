import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

/**
 * `GET /auth/me` body — the user shape plus the onboarding routing flag
 * (same flag/semantics as OtpVerifyResponseDto from AUTH-003, now backed by
 * the real check since ONB-001).
 */
export class MeResponseDto extends UserResponseDto {
  @ApiProperty({
    example: false,
    description:
      'Whether the web should route to /onboarding instead of /dashboard ' +
      '(true once onboardingCompletedAt is set).',
  })
  onboardingCompleted!: boolean;
}
