import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { USER_PHONE_REGEX } from '../../../common/constants/phone';
import { SmsClientType } from '../../sms/sms.constants';

/**
 * `POST /auth/otp/verify` body — step 2 of phone login: correct code logs the
 * user in, registering the account on first verification (AUTH-003).
 */
export class OtpVerifyDto {
  @ApiProperty({
    example: '09121234567',
    description: 'Normalized `09xxxxxxxxx`',
    pattern: '^09\\d{9}$',
  })
  @IsString()
  @Matches(USER_PHONE_REGEX, {
    message: 'phone must be a valid Iranian mobile number (09xxxxxxxxx)',
  })
  phone!: string;

  @ApiProperty({ example: '123456', pattern: '^\\d{6}$' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;

  /**
   * Accepted for payload symmetry with `/auth/otp/request` (the web BFF sends
   * the same shape to both routes); verification itself sends no SMS, so it
   * has no effect here.
   */
  @ApiPropertyOptional({
    enum: SmsClientType,
    default: SmsClientType.Web,
    description: 'Ignored on verify — kept for symmetry with the request step',
  })
  @IsOptional()
  @IsIn([SmsClientType.Web, SmsClientType.Android])
  clientType?: SmsClientType;
}
