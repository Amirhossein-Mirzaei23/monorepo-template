import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/** Partial of CreateUserDto (every field optional) plus role management. */
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  override role?: UserRole;
}
