import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { USER_PHONE_REGEX } from '../../../common/constants/phone';
import { SmsClientType } from '../../sms/sms.constants';

/** `POST /auth/otp/request` body — step 1 of phone login (AUTH-003). */
export class OtpRequestDto {
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

  @ApiPropertyOptional({
    enum: SmsClientType,
    default: SmsClientType.Web,
    description: 'Selects the SMS provider pattern variant',
  })
  @IsOptional()
  @IsIn([SmsClientType.Web, SmsClientType.Android])
  clientType?: SmsClientType;
}
