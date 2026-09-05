import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** `POST /auth/otp/request` response — drives the client resend countdown. */
export class OtpRequestResponseDto {
  @ApiProperty({
    example: '2026-01-01T00:02:00.000Z',
    description: 'When the issued code expires (resend allowed afterwards at the latest)',
  })
  expiresAt!: Date;

  @ApiPropertyOptional({
    example: '123456',
    description:
      'The issued code itself — present ONLY when OTP_DEV_MODE is enabled ' +
      '(never in production) so agents and tests can log in without SMS.',
  })
  devCode?: string;
}
