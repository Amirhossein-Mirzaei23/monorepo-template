import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { AccountRole, UserRole, UserStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * Filters of GET /admin/users (admin panel Task 05) — the canonical admin
 * search. `q` is one free term matched against phone, name, email AND the
 * profile business name (case-insensitive substring); the rest are exact
 * enum/state filters. Extends the shared pagination/sort contract; sort
 * allowlist: createdAt, phone, name, email (+ a deterministic id tiebreak).
 */
export class AdminUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Free search term — matches phone, name, email or business name',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: AccountRole })
  @IsOptional()
  @IsEnum(AccountRole)
  accountRole?: AccountRole;

  @ApiPropertyOptional({
    description: 'true = onboarding completed, false = not completed yet',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return value;
  })
  @IsBoolean()
  onboarded?: boolean;
}
