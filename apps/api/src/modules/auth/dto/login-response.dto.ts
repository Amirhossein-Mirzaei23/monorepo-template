import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

/**
 * What login/refresh/register return over HTTP. The refresh token itself never
 * appears here — it travels exclusively in the httpOnly `refresh_token` cookie.
 */
export class LoginResponseDto {
  @ApiProperty({ description: 'Short-lived JWT access token (bearer)' })
  accessToken!: string;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
