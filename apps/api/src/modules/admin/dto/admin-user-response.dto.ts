import { ApiProperty } from '@nestjs/swagger';
import { AccountRole, User, UserRole, UserStatus, type Profile } from '@prisma/client';

/**
 * Allowlisted admin user shapes (admin panel Task 05). The generic
 * `UserResponseDto` grows `onboardingCompletedAt`/`deletedAt` for operations,
 * but — like every admin surface — NEVER `passwordHash` or refresh tokens.
 * List rows embed a bounded profile summary (businessName is searchable);
 * the detail adds bounded lot/deal counts.
 */

/** Allowlisted operational row — the shared base of list items and detail. */
export class AdminUserResponseDto {
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

  @ApiProperty({
    example: '2026-01-01T00:00:00.000Z',
    nullable: true,
    type: Date,
  })
  onboardingCompletedAt!: Date | null;

  @ApiProperty({ example: null, nullable: true, type: Date })
  deletedAt!: Date | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;
}

/** Bounded profile summary joined into list rows and the detail payload. */
export class AdminUserProfileSummaryDto {
  @ApiProperty({ example: 'فروشگاه نمونه' })
  displayName!: string;

  @ApiProperty({ example: 'کسب‌وکار نمونه', nullable: true, type: String })
  businessName!: string | null;

  @ApiProperty({ example: 'tehran', nullable: true, type: String })
  province!: string | null;

  @ApiProperty({ example: 'tehran', nullable: true, type: String })
  city!: string | null;

  @ApiProperty({ example: false })
  isBuyer!: boolean;

  @ApiProperty({ example: true })
  isSeller!: boolean;

  @ApiProperty({ example: 0 })
  successfulDeals!: number;
}

/** One list row of GET /admin/users — user row + bounded profile summary. */
export class AdminUserListItemDto extends AdminUserResponseDto {
  @ApiProperty({ type: AdminUserProfileSummaryDto, nullable: true })
  profile!: AdminUserProfileSummaryDto | null;
}

/** Bounded lot/deal counters — the detail payload's operational summary. */
export class AdminUserCountsDto {
  @ApiProperty({ example: 4, description: 'Lots owned by the user' })
  lots!: number;

  @ApiProperty({ example: 2, description: 'Deals where the user is the buyer' })
  dealsAsBuyer!: number;

  @ApiProperty({ example: 1, description: 'Deals where the user is the seller' })
  dealsAsSeller!: number;
}

/** GET /admin/users/:id — user + profile summary + bounded counts. */
export class AdminUserDetailDto extends AdminUserListItemDto {
  @ApiProperty({ type: AdminUserCountsDto })
  counts!: AdminUserCountsDto;
}

/** Paginated envelope of GET /admin/users (named schema for codegen). */
export class AdminUsersListResponseDto {
  @ApiProperty({ type: [AdminUserListItemDto] })
  items!: AdminUserListItemDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}

export function toAdminUserResponse(user: User): AdminUserResponseDto {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    accountRoles: user.accountRoles,
    onboardingCompletedAt: user.onboardingCompletedAt,
    deletedAt: user.deletedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toAdminUserProfileSummary(
  profile: Profile | null | undefined,
): AdminUserProfileSummaryDto | null {
  if (!profile) {
    return null;
  }
  return {
    displayName: profile.displayName,
    businessName: profile.businessName,
    province: profile.province,
    city: profile.city,
    isBuyer: profile.isBuyer,
    isSeller: profile.isSeller,
    successfulDeals: profile.successfulDeals,
  };
}
