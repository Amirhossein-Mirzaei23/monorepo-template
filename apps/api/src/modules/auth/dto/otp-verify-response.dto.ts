import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

/**
 * What `POST /auth/otp/verify` returns over HTTP: the standard session shape
 * (access token in the body, refresh token in the httpOnly cookie — same as
 * password login) plus the routing flag for the web.
 */
export class OtpVerifyResponseDto {
  @ApiProperty({ description: 'Short-lived JWT access token (bearer)' })
  accessToken!: string;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiProperty({
    example: true,
    description:
      'Whether the web should route to /onboarding instead of /dashboard. ' +
      'Placeholder until ONB-001 lands the profile check.',
  })
  onboardingCompleted!: boolean;
}
