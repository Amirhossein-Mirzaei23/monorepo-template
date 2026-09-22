import { Injectable } from '@nestjs/common';
import {
  type AccountRole,
  type Prisma,
  type Profile,
  type User,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  toAdminUserProfileSummary,
  type AdminUserProfileSummaryDto,
} from './dto/admin-user-response.dto';

export type AdminUsersTx = Prisma.TransactionClient | undefined;

/**
 * The where-shape the admin users search builds (Task 05). The `OR` arms are
 * the free-term `q` search across phone/name/email plus the business-name arm
 * (a bounded to-one relation filter — no id pre-resolution); the rest are
 * exact filters.
 */
export interface AdminUsersWhere {
  OR?: Array<{
    phone?: { contains: string; mode: 'insensitive' };
    name?: { contains: string; mode: 'insensitive' };
    email?: { contains: string; mode: 'insensitive' };
    profile?: { is: { businessName: { contains: string; mode: 'insensitive' } } };
  }>;
  accountRoles?: { has: AccountRole };
  onboardingCompletedAt?: null | { not: null };
  role?: UserRole;
  status?: UserStatus;
}

export interface ListAdminUsersParams {
  page: number;
  limit: number;
  orderBy: Prisma.UserOrderByWithRelationInput[];
  where?: AdminUsersWhere;
}

/**
 * Data access for the admin user-management surface (admin panel Task 05).
 * Data access only — every method accepts an optional transaction client so
 * the service owns the unit of work (doc/CONVENTIONS.md → Transactions);
 * repositories never call $transaction. Every read is bounded and projects
 * only allowlisted fields — never password hashes or refresh tokens. The
 * profile summary is a separate take-capped page read (the joined profile of
 * the ≤ `limit` users on the current page), not an unbounded include.
 */
@Injectable()
export class AdminUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx: AdminUsersTx): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  async findMany(
    { page, limit, orderBy, where }: ListAdminUsersParams,
    tx: AdminUsersTx = undefined,
  ): Promise<{ items: User[]; total: number }> {
    const client = this.client(tx);
    const [items, total] = await Promise.all([
      client.user.findMany({
        where: where as Prisma.UserWhereInput,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      client.user.count({ where: where as Prisma.UserWhereInput }),
    ]);
    return { items, total };
  }

  /** Profile summaries for exactly the users on one page (bounded take). */
  async findProfilesByUserIds(
    userIds: string[],
    tx: AdminUsersTx = undefined,
  ): Promise<Map<string, AdminUserProfileSummaryDto | null>> {
    if (userIds.length === 0) {
      return new Map();
    }
    const rows: Profile[] = await this.client(tx).profile.findMany({
      where: { userId: { in: userIds } },
    });
    return new Map(rows.map((row) => [row.userId, toAdminUserProfileSummary(row)]));
  }

  findById(id: string, tx: AdminUsersTx = undefined): Promise<User | null> {
    return this.client(tx).user.findUnique({ where: { id } });
  }

  /** Status write of the explicit transition (DELETE carries deletedAt). */
  updateStatus(
    id: string,
    data: { status: UserStatus; deletedAt?: Date },
    tx: AdminUsersTx,
  ): Promise<User> {
    return this.client(tx).user.update({ where: { id }, data });
  }

  /** Role write of the explicit transition. */
  updateRole(id: string, role: UserRole, tx: AdminUsersTx): Promise<User> {
    return this.client(tx).user.update({ where: { id }, data: { role } });
  }

  findProfileByUserId(userId: string, tx: AdminUsersTx = undefined): Promise<Profile | null> {
    return this.client(tx).profile.findUnique({ where: { userId } });
  }

  countLots(sellerId: string, tx: AdminUsersTx = undefined): Promise<number> {
    return this.client(tx).lot.count({ where: { sellerId } });
  }

  countDealsAsBuyer(buyerId: string, tx: AdminUsersTx = undefined): Promise<number> {
    return this.client(tx).deal.count({ where: { buyerId } });
  }

  countDealsAsSeller(sellerId: string, tx: AdminUsersTx = undefined): Promise<number> {
    return this.client(tx).deal.count({ where: { sellerId } });
  }

  /** Count of ACTIVE admins excluding one user — the last-admin guard input. */
  countActiveAdminsExcluding(
    excludedUserId: string,
    tx: AdminUsersTx = undefined,
  ): Promise<number> {
    return this.client(tx).user.count({
      where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE, id: { not: excludedUserId } },
    });
  }

  /** Revokes every ACTIVE refresh session of the user; returns the revocation count. */
  async revokeActiveSessions(userId: string, tx: AdminUsersTx): Promise<number> {
    const result = await this.client(tx).refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}
