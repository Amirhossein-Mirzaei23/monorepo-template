import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

/** Reason length — long enough to be meaningful, short enough to be typed. */
export const USER_ACTION_REASON_MIN = 5;
export const USER_ACTION_REASON_MAX = 500;

/**
 * Narrow, one-action-per-endpoint DTOs (admin panel Task 05). The legacy
 * generic PATCH /users/:id (role + password + …) is gone: operational changes
 * flow ONLY through these explicit payloads, each carrying a required reason
 * that lands in the audit log. No password field exists anywhere in this file
 * by design.
 */

/** The explicit status transitions of PATCH /admin/users/:id/status. */
export enum UserStatusAction {
  SUSPEND = 'SUSPEND',
  BLOCK = 'BLOCK',
  ACTIVATE = 'ACTIVATE',
  DELETE = 'DELETE',
}

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatusAction, description: 'The one transition to perform' })
  @IsEnum(UserStatusAction)
  action!: UserStatusAction;

  @ApiProperty({
    minLength: USER_ACTION_REASON_MIN,
    maxLength: USER_ACTION_REASON_MAX,
    example: 'نقض قوانین پلتفرم',
    description: 'Required — written to the audit log with the action',
  })
  @IsString()
  @MinLength(USER_ACTION_REASON_MIN)
  @MaxLength(USER_ACTION_REASON_MAX)
  reason!: string;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty({
    minLength: USER_ACTION_REASON_MIN,
    maxLength: USER_ACTION_REASON_MAX,
    example: 'سلب دسترسی مدیریتی',
    description: 'Required — written to the audit log with the action',
  })
  @IsString()
  @MinLength(USER_ACTION_REASON_MIN)
  @MaxLength(USER_ACTION_REASON_MAX)
  reason!: string;
}

export class RevokeUserSessionsDto {
  @ApiProperty({
    minLength: USER_ACTION_REASON_MIN,
    maxLength: USER_ACTION_REASON_MAX,
    example: 'نشست‌های مشکوک',
    description: 'Required — written to the audit log with the action',
  })
  @IsString()
  @MinLength(USER_ACTION_REASON_MIN)
  @MaxLength(USER_ACTION_REASON_MAX)
  reason!: string;
}

/** Response of POST /admin/users/:id/revoke-sessions. */
export class RevokeSessionsResponseDto {
  @ApiProperty({ example: 'clx…cuid' })
  id!: string;

  @ApiProperty({ example: 3 })
  revokedSessions!: number;
}
