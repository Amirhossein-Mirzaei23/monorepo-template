import {
  type Category,
  type OtpCode,
  OtpPurpose,
  type Prisma,
  type User,
  UserRole,
  UserStatus,
  AccountRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

interface RefreshTokenRow {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  deviceLabel: string | null;
  userAgent: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

type UserWhere = {
  phone?: string;
  email?: string | null;
  role?: UserRole;
  status?: UserStatus;
};
type UserOrderBy = Record<string, 'asc' | 'desc'>;

type CategoryWhere = {
  isActive?: boolean;
  parentId?: string | null;
};
type CategoryOrderBy = Record<string, 'asc' | 'desc'>;
/** Exactly the surface CategoriesRepository uses: one level of included children. */
type CategoryFindManyArgs = {
  where?: CategoryWhere;
  orderBy?: CategoryOrderBy | CategoryOrderBy[];
  skip?: number;
  take?: number;
  include?: { children?: { where?: CategoryWhere; orderBy?: CategoryOrderBy | CategoryOrderBy[] } };
};

type OtpWhere = {
  id?: string;
  phone?: string;
  purpose?: OtpPurpose;
  consumedAt?: Date | null;
  expiresAt?: { gt: Date };
  lastSentAt?: { gte: Date };
};
type OtpOrderBy = Record<string, 'asc' | 'desc'>;

const nowIso = () => new Date();

/**
 * Deterministic in-memory Prisma stand-in covering exactly the surface this app
 * uses (user + refreshToken + otpCode + category tables, interactive
 * $transaction, $queryRaw). Lets unit and e2e suites run green without a
 * database.
 */
export class FakePrisma {
  private readonly users = new Map<string, User>();
  private readonly refreshTokens = new Map<string, RefreshTokenRow>();
  private readonly otpCodes = new Map<string, OtpCode>();
  private readonly categories = new Map<string, Category>();

  readonly user = {
    findMany: async ({
      where,
      orderBy,
      skip = 0,
      take,
    }: {
      where?: UserWhere;
      orderBy?: UserOrderBy;
      skip?: number;
      take?: number;
    }): Promise<User[]> => {
      let rows = [...this.users.values()].filter(matchesWhere(where));
      for (const [field, order] of Object.entries(orderBy ?? {})) {
        rows = rows.sort((a, b) => {
          const av = a[field as keyof User] as string | Date;
          const bv = b[field as keyof User] as string | Date;
          const cmp = av > bv ? 1 : av < bv ? -1 : 0;
          return order === 'desc' ? -cmp : cmp;
        });
      }
      rows = rows.slice(skip, take !== undefined ? skip + take : undefined);
      return rows.map(cloneUser);
    },
    count: async ({ where }: { where?: UserWhere } = {}): Promise<number> =>
      [...this.users.values()].filter(matchesWhere(where)).length,
    findUnique: async ({
      where,
    }: {
      where: { id?: string; phone?: string; email?: string | null };
    }): Promise<User | null> => {
      let found: User | undefined;
      if (where.id !== undefined) {
        found = this.users.get(where.id);
      } else if (where.phone !== undefined) {
        found = [...this.users.values()].find((user) => user.phone === where.phone);
      } else if (where.email !== undefined) {
        found = [...this.users.values()].find((user) => user.email === where.email);
      }
      return found ? cloneUser(found) : null;
    },
    create: async ({ data }: { data: Prisma.UserUncheckedCreateInput }): Promise<User> => {
      const row: User = {
        id: randomUUID(),
        phone: String(data.phone),
        email: data.email == null ? null : String(data.email),
        name: String(data.name ?? ''),
        // Prisma semantics: omitted and explicit null are both null (not "null").
        passwordHash: data.passwordHash == null ? null : String(data.passwordHash),
        role: (data.role as UserRole | undefined) ?? UserRole.USER,
        status: (data.status as UserStatus | undefined) ?? UserStatus.ACTIVE,
        accountRoles: (data.accountRoles as AccountRole[] | undefined) ?? [],
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      this.users.set(row.id, row);
      return cloneUser(row);
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Prisma.UserUpdateInput;
    }): Promise<User> => {
      const row = this.users.get(where.id);
      if (!row) {
        throw new Error(`FakePrisma: user ${where.id} not found`);
      }
      const next: User = {
        ...row,
        ...(data.phone !== undefined ? { phone: String(data.phone) } : {}),
        ...(data.email !== undefined
          ? { email: data.email === null ? null : String(data.email) }
          : {}),
        ...(data.name !== undefined ? { name: String(data.name) } : {}),
        ...(data.passwordHash !== undefined
          ? { passwordHash: data.passwordHash === null ? null : String(data.passwordHash) }
          : {}),
        ...(data.role !== undefined ? { role: data.role as UserRole } : {}),
        ...(data.status !== undefined ? { status: data.status as UserStatus } : {}),
        ...(data.accountRoles !== undefined
          ? { accountRoles: data.accountRoles as AccountRole[] }
          : {}),
        ...(data.deletedAt !== undefined ? { deletedAt: data.deletedAt as Date | null } : {}),
        updatedAt: nowIso(),
      };
      this.users.set(row.id, next);
      return cloneUser(next);
    },
    delete: async ({ where }: { where: { id: string } }): Promise<User> => {
      const row = this.users.get(where.id);
      if (!row) {
        throw new Error(`FakePrisma: user ${where.id} not found`);
      }
      this.users.delete(where.id);
      return cloneUser(row);
    },
  };

  readonly refreshToken = {
    create: async ({
      data,
    }: {
      data: {
        tokenHash: string;
        userId: string;
        expiresAt: Date;
        deviceLabel?: string | null;
        userAgent?: string | null;
        lastUsedAt?: Date | null;
      };
    }): Promise<RefreshTokenRow> => {
      const row: RefreshTokenRow = {
        id: randomUUID(),
        tokenHash: data.tokenHash,
        userId: data.userId,
        expiresAt: data.expiresAt,
        revokedAt: null,
        deviceLabel: data.deviceLabel ?? null,
        userAgent: data.userAgent ?? null,
        lastUsedAt: data.lastUsedAt ?? null,
        createdAt: nowIso(),
      };
      this.refreshTokens.set(row.id, row);
      return { ...row };
    },
    findUnique: async ({
      where,
    }: {
      where: { tokenHash: string };
    }): Promise<RefreshTokenRow | null> => {
      const found = [...this.refreshTokens.values()].find(
        (row) => row.tokenHash === where.tokenHash,
      );
      return found ? { ...found } : null;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: string; userId?: string; tokenHash?: string; revokedAt?: null };
      data: { revokedAt: Date; lastUsedAt?: Date };
    }): Promise<number> => {
      let changed = 0;
      for (const row of this.refreshTokens.values()) {
        const idMatch = where.id === undefined || row.id === where.id;
        const userIdMatch = where.userId === undefined || row.userId === where.userId;
        const hashMatch = where.tokenHash === undefined || row.tokenHash === where.tokenHash;
        const unrevokedMatch = where.revokedAt === null ? row.revokedAt === null : true;
        if (idMatch && userIdMatch && hashMatch && unrevokedMatch) {
          row.revokedAt = data.revokedAt;
          if (data.lastUsedAt !== undefined) {
            row.lastUsedAt = data.lastUsedAt;
          }
          changed += 1;
        }
      }
      return changed;
    },
  };

  readonly otpCode = {
    findFirst: async ({
      where,
      orderBy,
    }: {
      where?: OtpWhere;
      orderBy?: OtpOrderBy;
    }): Promise<OtpCode | null> => {
      let rows = [...this.otpCodes.values()].filter(matchesOtpWhere(where));
      for (const [field, order] of Object.entries(orderBy ?? {})) {
        rows = rows.sort((a, b) => {
          const av = a[field as keyof OtpCode] as string | Date;
          const bv = b[field as keyof OtpCode] as string | Date;
          const cmp = av > bv ? 1 : av < bv ? -1 : 0;
          return order === 'desc' ? -cmp : cmp;
        });
      }
      const first = rows[0];
      return first ? cloneOtp(first) : null;
    },
    count: async ({ where }: { where?: OtpWhere } = {}): Promise<number> =>
      [...this.otpCodes.values()].filter(matchesOtpWhere(where)).length,
    create: async ({
      data,
    }: {
      data: {
        phone: string;
        codeHash: string;
        purpose: OtpPurpose;
        expiresAt: Date;
        consumedAt?: Date | null;
        attempts?: number;
        lastSentAt: Date;
      };
    }): Promise<OtpCode> => {
      const row: OtpCode = {
        id: randomUUID(),
        phone: data.phone,
        codeHash: data.codeHash,
        purpose: data.purpose,
        expiresAt: data.expiresAt,
        consumedAt: data.consumedAt ?? null,
        attempts: data.attempts ?? 0,
        lastSentAt: data.lastSentAt,
        createdAt: nowIso(),
      };
      this.otpCodes.set(row.id, row);
      return cloneOtp(row);
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { attempts?: { increment: number } };
    }): Promise<OtpCode> => {
      const row = this.otpCodes.get(where.id);
      if (!row) {
        throw new Error(`FakePrisma: otpCode ${where.id} not found`);
      }
      const next: OtpCode = { ...row, attempts: row.attempts + (data.attempts?.increment ?? 0) };
      this.otpCodes.set(row.id, next);
      return cloneOtp(next);
    },
    updateMany: async ({
      where,
      data,
    }: {
      where?: OtpWhere;
      data: { consumedAt: Date };
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of this.otpCodes.values()) {
        if (matchesOtpWhere(where)(row)) {
          row.consumedAt = data.consumedAt;
          count += 1;
        }
      }
      return { count };
    },
  };

  readonly category = {
    findMany: async ({
      where,
      orderBy,
      skip = 0,
      take,
      include,
    }: CategoryFindManyArgs): Promise<(Category & { children?: Category[] })[]> => {
      let rows = [...this.categories.values()].filter(matchesCategoryWhere(where));
      rows = sortRows(rows, orderBy);
      rows = rows.slice(skip, take !== undefined ? skip + take : undefined);
      return rows.map((row) => {
        if (!include?.children) {
          return cloneCategory(row);
        }
        let children = [...this.categories.values()]
          .filter((child) => child.parentId === row.id)
          .filter(matchesCategoryWhere(include.children.where));
        children = sortRows(children, include.children.orderBy);
        return { ...cloneCategory(row), children: children.map(cloneCategory) };
      });
    },
    findUnique: async ({
      where,
    }: {
      where: { id?: string; slug?: string };
    }): Promise<Category | null> => {
      let found: Category | undefined;
      if (where.id !== undefined) {
        found = this.categories.get(where.id);
      } else if (where.slug !== undefined) {
        found = [...this.categories.values()].find((row) => row.slug === where.slug);
      }
      return found ? cloneCategory(found) : null;
    },
    create: async ({
      data,
    }: {
      data: {
        nameFa: string;
        nameEn?: string | null;
        slug: string;
        parentId?: string | null;
        sortOrder: number;
        isActive?: boolean;
      };
    }): Promise<Category> => {
      const row: Category = {
        id: randomUUID(),
        nameFa: data.nameFa,
        nameEn: data.nameEn == null ? null : String(data.nameEn),
        slug: data.slug,
        parentId: data.parentId == null ? null : String(data.parentId),
        sortOrder: data.sortOrder,
        isActive: data.isActive ?? true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      this.categories.set(row.id, row);
      return cloneCategory(row);
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async $queryRaw(): Promise<unknown[]> {
    return [{ ok: 1 }];
  }

  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}

  /** Test helper: direct seeded rows (e.g. a pre-existing admin). */
  seedUser(
    user: Pick<User, 'phone' | 'name'> & {
      email?: string | null;
      passwordHash?: string | null;
      role?: UserRole;
      status?: UserStatus;
      accountRoles?: AccountRole[];
    },
  ): User {
    const row: User = {
      id: randomUUID(),
      phone: user.phone,
      email: user.email ?? null,
      name: user.name,
      passwordHash: user.passwordHash ?? null,
      role: user.role ?? UserRole.USER,
      status: user.status ?? UserStatus.ACTIVE,
      accountRoles: user.accountRoles ?? [],
      deletedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.users.set(row.id, row);
    return cloneUser(row);
  }

  /** Test helper: direct seeded rows (controlled lastSentAt/createdAt for send-cap windows). */
  seedOtpCode(code: {
    phone: string;
    codeHash?: string;
    purpose?: OtpPurpose;
    expiresAt?: Date;
    consumedAt?: Date | null;
    attempts?: number;
    lastSentAt?: Date;
    createdAt?: Date;
  }): OtpCode {
    const row: OtpCode = {
      id: randomUUID(),
      phone: code.phone,
      codeHash: code.codeHash ?? 'seeded-code-hash',
      purpose: code.purpose ?? OtpPurpose.LOGIN,
      expiresAt: code.expiresAt ?? new Date(nowIso().getTime() + 300_000),
      consumedAt: code.consumedAt ?? null,
      attempts: code.attempts ?? 0,
      lastSentAt: code.lastSentAt ?? nowIso(),
      createdAt: code.createdAt ?? nowIso(),
    };
    this.otpCodes.set(row.id, row);
    return cloneOtp(row);
  }

  /** Test helper: direct seeded rows (tree fixtures for GET /categories). */
  seedCategory(category: {
    nameFa: string;
    nameEn?: string | null;
    slug: string;
    parentId?: string | null;
    sortOrder: number;
    isActive?: boolean;
  }): Category {
    const row: Category = {
      id: randomUUID(),
      nameFa: category.nameFa,
      nameEn: category.nameEn ?? null,
      slug: category.slug,
      parentId: category.parentId ?? null,
      sortOrder: category.sortOrder,
      isActive: category.isActive ?? true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.categories.set(row.id, row);
    return cloneCategory(row);
  }
}

function matchesWhere(where: UserWhere | undefined): (user: User) => boolean {
  return (user) =>
    (where?.phone === undefined || user.phone === where.phone) &&
    (where?.email === undefined || user.email === where.email) &&
    (where?.role === undefined || user.role === where.role) &&
    (where?.status === undefined || user.status === where.status);
}

function cloneUser(user: User): User {
  return { ...user, createdAt: new Date(user.createdAt), updatedAt: new Date(user.updatedAt) };
}

function matchesOtpWhere(where: OtpWhere | undefined): (row: OtpCode) => boolean {
  return (row) =>
    (where?.id === undefined || row.id === where.id) &&
    (where?.phone === undefined || row.phone === where.phone) &&
    (where?.purpose === undefined || row.purpose === where.purpose) &&
    (where?.consumedAt === undefined || row.consumedAt === where.consumedAt) &&
    (where?.expiresAt === undefined || row.expiresAt > where.expiresAt.gt) &&
    (where?.lastSentAt === undefined || row.lastSentAt >= where.lastSentAt.gte);
}

function cloneOtp(row: OtpCode): OtpCode {
  return {
    ...row,
    expiresAt: new Date(row.expiresAt),
    consumedAt: row.consumedAt === null ? null : new Date(row.consumedAt),
    lastSentAt: new Date(row.lastSentAt),
    createdAt: new Date(row.createdAt),
  };
}

function matchesCategoryWhere(where: CategoryWhere | undefined): (row: Category) => boolean {
  return (row) =>
    (where?.isActive === undefined || row.isActive === where.isActive) &&
    (where?.parentId === undefined || row.parentId === where.parentId);
}

/** Multi-key stable sort (orderBy is a single object or an array of them). */
function sortRows<T extends Category | User>(
  rows: T[],
  orderBy: Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[] | undefined,
): T[] {
  const criteria = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  return [...rows].sort((a, b) => {
    for (const [field, order] of criteria.flatMap((entry) => Object.entries(entry))) {
      const av = a[field as keyof T] as string | number | Date | null;
      const bv = b[field as keyof T] as string | number | Date | null;
      const cmp = av === bv ? 0 : av === null ? 1 : bv === null ? -1 : av > bv ? 1 : -1;
      if (cmp !== 0) {
        return order === 'desc' ? -cmp : cmp;
      }
    }
    return 0;
  });
}

function cloneCategory(row: Category): Category {
  return { ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
}
