import { ApiProperty } from '@nestjs/swagger';
import { type User, UserRole, UserStatus, AccountRole } from '@prisma/client';

/** Public representation of a user — never exposes `passwordHash`. */
export class UserResponseDto {
  @ApiProperty({ example: 'clx…cuid' })
  id!: string;

  @ApiProperty({ example: '09120000000', description: 'Normalized `09xxxxxxxxx`' })
  phone!: string;

  @ApiProperty({ example: 'jane@example.com', nullable: true, type: String })
  email!: string | null;

  @ApiProperty({ example: 'Jane Doe' })
  name!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ enum: AccountRole, isArray: true })
  accountRoles!: AccountRole[];

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;
}

export function toUserResponse(user: User): UserResponseDto {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    accountRoles: user.accountRoles,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
