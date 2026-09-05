import { Injectable } from '@nestjs/common';
import type { AccountRole, Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ListUsersParams {
  page: number;
  limit: number;
  orderBy: Prisma.UserOrderByWithRelationInput;
  where?: Prisma.UserWhereInput;
}

type Tx = Prisma.TransactionClient | undefined;

/**
 * Data access only. Every method accepts an optional transaction client so the
 * repository stays unit-of-work agnostic — services own transaction boundaries
 * (doc/CONVENTIONS.md → Transactions). Repositories never call $transaction.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx: Tx): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  async findMany(
    { page, limit, orderBy, where }: ListUsersParams,
    tx: Tx = undefined,
  ): Promise<{ items: User[]; total: number }> {
    const client = this.client(tx);
    const [items, total] = await Promise.all([
      client.user.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
      client.user.count({ where }),
    ]);
    return { items, total };
  }

  async findById(id: string, tx: Tx = undefined): Promise<User | null> {
    return this.client(tx).user.findUnique({ where: { id } });
  }

  async findByPhone(phone: string, tx: Tx = undefined): Promise<User | null> {
    return this.client(tx).user.findUnique({ where: { phone } });
  }

  async findByEmail(email: string, tx: Tx = undefined): Promise<User | null> {
    return this.client(tx).user.findUnique({ where: { email } });
  }

  async create(
    data: {
      phone: string;
      email?: string | null;
      name: string;
      /** Optional: phone-OTP users have no password (admin-only path, plan §2.7). */
      passwordHash?: string | null;
      /** Optional: defaults to USER at the database level. */
      role?: UserRole;
    },
    tx: Tx = undefined,
  ): Promise<User> {
    return this.client(tx).user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput, tx: Tx = undefined): Promise<User> {
    return this.client(tx).user.update({ where: { id }, data });
  }

  /**
   * ONB-001: the User-side writes of the onboarding transaction — sync
   * accountRoles to the submitted hats and stamp onboardingCompletedAt.
   * The caller computes the first-completion semantics (never reset).
   */
  async updateOnboarding(
    id: string,
    data: { accountRoles: AccountRole[]; onboardingCompletedAt: Date },
    tx: Tx = undefined,
  ): Promise<User> {
    return this.client(tx).user.update({ where: { id }, data });
  }

  async delete(id: string, tx: Tx = undefined): Promise<User> {
    return this.client(tx).user.delete({ where: { id } });
  }
}
