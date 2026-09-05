import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { USER_PHONE_REGEX } from '../../../common/constants/phone';

/** List filters for GET /users — extends the shared pagination/sort contract. */
export class UsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '09120000000' })
  @IsOptional()
  @IsString()
  @Matches(USER_PHONE_REGEX, {
    message: 'phone must be a valid Iranian mobile number (09xxxxxxxxx)',
  })
  phone?: string;

  @ApiPropertyOptional({ example: 'jane@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
