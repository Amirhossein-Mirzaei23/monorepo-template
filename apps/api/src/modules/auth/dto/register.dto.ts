import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { USER_PHONE_REGEX } from '../../../common/constants/phone';

/**
 * Phone-based registration (transitional until OTP login-or-register lands in
 * AUTH-003). Email is optional profile data, not the identity.
 */
export class RegisterDto {
  @ApiProperty({ example: '09120000000', description: 'Normalized `09xxxxxxxxx`' })
  @IsString()
  @Matches(USER_PHONE_REGEX, {
    message: 'phone must be a valid Iranian mobile number (09xxxxxxxxx)',
  })
  phone!: string;

  @ApiPropertyOptional({ example: 'jane@example.com', format: 'email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 's3cure-pass', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
