import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { USER_PHONE_REGEX } from '../../../common/constants/phone';

export class CreateUserDto {
  @ApiProperty({ example: '09120000000', description: 'Normalized `09xxxxxxxxx`' })
  @IsString()
  @Matches(USER_PHONE_REGEX, {
    message: 'phone must be a valid Iranian mobile number (09xxxxxxxxx)',
  })
  phone!: string;

  @ApiPropertyOptional({
    example: 'jane@example.com',
    format: 'email',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 's3cure-pass', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.USER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
