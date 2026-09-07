import {
  type Category,
  type Conversation,
  ConversationStatus,
  type LiquidationReason,
  type Lot,
  LotCondition,
  type LotMedia,
  LotStatus,
  LotUnit,
  type MediaAsset,
  MediaType,
  type Message,
  MessageType,
  type OtpCode,
  OtpPurpose,
  type Prisma,
  type PricingType,
  type Profile,
  type ProfileInterest,
  type User,
  UserRole,
  UserStatus,
  AccountRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { LOT_SEARCH_SQL_MARKER, normalizeFaQuery } from '../../modules/lots/lots.constants';

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
  id?: { in: string[] };
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

/** Exactly the surface ProfilesRepository reads back (interests + category). */
type ProfileWithInterestsRow = Profile & {
  interests: (ProfileInterest & { category: Category })[];
};
/** Writable subset of the onboarding upsert payload (all scalars, no relations). */
type ProfileUpsertData = Omit<Profile, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

type OtpWhere = {
  id?: string;
  phone?: string;
  purpose?: OtpPurpose;
  consumedAt?: Date | null;
  expiresAt?: { gt: Date };
  lastSentAt?: { gte: Date };
};
type OtpOrderBy = Record<string, 'asc' | 'desc'>;

/** Exactly the surface MediaRepository composes (MEDIA-001 serving + MEDIA-002 quota). */
type MediaAssetWhere = {
  id?: string;
  storageKey?: string;
  ownerId?: string;
  createdAt?: { gte?: Date };
};
/** Create payload: all scalars (no relations — ownerId is the FK column). */
type MediaAssetCreateData = {
  ownerId: string;
  type: MediaType;
  storageKey: string;
  thumbKey?: string | null;
  mime: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
};

/** Exactly the surface LotsRepository composes (LOT-001 findPublic + lookups
 * + LOT-005 findMine's notIn status predicate). */
type LotEnumFilter<T extends string> = T | { in: T[] } | { notIn: T[] };
type LotTextFilter = { contains: string; mode: 'insensitive' };
/** id: equality OR the MKT-003 search arm's `in` set OR the MKT-009
 * similar-lots self-exclusion (`not`). */
type LotIdFilter = string | { in?: string[]; not?: string };
type LotWhere = {
  id?: LotIdFilter;
  code?: string;
  sellerId?: string;
  categoryId?: string;
  subcategoryId?: string;
  city?: string;
  province?: string;
  pricingType?: PricingType;
  condition?: LotEnumFilter<LotCondition>;
  liquidationReason?: LotEnumFilter<LiquidationReason>;
  status?: LotEnumFilter<LotStatus>;
  unitPrice?: { gte?: number; lte?: number };
  quantity?: { gte?: number; lte?: number };
  createdAt?: { gte?: Date };
  expiresAt?: { gt?: Date; lt?: Date };
  deletedAt?: null;
  OR?: Array<{ title?: LotTextFilter; description?: LotTextFilter }>;
};
type LotOrderBy = Record<string, 'asc' | 'desc'>;
/** Writable scalar subset for the update path (counters also take {increment}). */
type LotUpdateData = Partial<{
  code: string;
  categoryId: string;
  subcategoryId: string | null;
  title: string;
  description: string;
  quantity: number;
  unit: LotUnit;
  availableQuantity: number;
  minOrderQuantity: number;
  pricingType: PricingType;
  totalPrice: number;
  unitPrice: number;
  condition: LotCondition;
  liquidationReason: LiquidationReason;
  province: string;
  city: string;
  locationHint: string | null;
  exactAddress: string | null;
  status: LotStatus;
  rejectionReason: string | null;
  viewCount: number | { increment: number };
  saveCount: number | { increment: number };
  expiresAt: Date;
  publishedAt: Date | null;
  soldAt: Date | null;
  featuredAt: Date | null;
  deletedAt: Date | null;
}>;
/** Create payload: required business scalars, defaults applied for the rest. */
type LotCreateData = {
  code: string;
  sellerId: string;
  categoryId: string;
  subcategoryId?: string | null;
  title: string;
  description: string;
  quantity: number;
  unit?: LotUnit;
  availableQuantity: number;
  minOrderQuantity: number;
  pricingType: PricingType;
  totalPrice: number;
  unitPrice: number;
  condition: LotCondition;
  liquidationReason: LiquidationReason;
  province: string;
  city: string;
  locationHint?: string | null;
  exactAddress?: string | null;
  status?: LotStatus;
  rejectionReason?: string | null;
  viewCount?: number;
  saveCount?: number;
  expiresAt: Date;
  publishedAt?: Date | null;
  soldAt?: Date | null;
  featuredAt?: Date | null;
  deletedAt?: Date | null;
};

const nowIso = () => new Date();

/** LotMedia row joined with its asset — what the repository's include returns. */
type LotMediaRow = LotMedia & { mediaAsset: MediaAsset };
/** Seller summary joined on every lot read — mirrors the MKT-001 card include's
 * `seller` shape ({id, name} + the Profile's businessName) and the MKT-009
 * detail include's wider select (businessName + city). Lenient by design:
 * specs that seed bare sellerIds ('seller-1') without user rows read back
 * name: '' / profile: null instead of throwing (a real DB cannot have a
 * missing seller — FK Restrict — so strictness would only churn fixtures). */
type LotSellerRow = {
  id: string;
  name: string;
  profile: { businessName: string | null; city: string | null } | null;
};
/** A Lot row as the repository's lot reads produce it (seller + gallery + the
 * MKT-009 detail include's category NAME rows). */
type LotRowWithMedia = Lot & {
  seller: LotSellerRow;
  media: LotMediaRow[];
  category: Category;
  subcategory: Category | null;
};
/** Exactly the surface LotsRepository's gallery methods compose (MEDIA-005). */
type LotMediaWhere = { lotId?: string; mediaAssetId?: { notIn: string[] } };
type LotMediaUpsertInput = {
  where: { lotId_mediaAssetId: { lotId: string; mediaAssetId: string } };
  create: { lotId: string; mediaAssetId: string; sortOrder: number; isCover: boolean };
  update: { sortOrder: number; isCover: boolean };
};

/** Exactly the surface ConversationsRepository composes (CHT-001): the
 * get-or-create unique-key lookup + create, both reading the conversation
 * back WITH its lot joined (cover media included) for the response mapper. */
type ConversationFindUniqueArgs = {
  where: { id?: string; lotId_buyerId?: { lotId: string; buyerId: string } };
  include?: { lot?: unknown };
};
/** Create payload: required scalars; status/unreads take the DB defaults. */
type ConversationCreateData = {
  lotId: string;
  buyerId: string;
  sellerId: string;
  lastMessageAt: Date;
  lastMessagePreview?: string | null;
  status?: ConversationStatus;
  buyerUnreadCount?: number;
  sellerUnreadCount?: number;
};
/** A Conversation row as the repository reads produce it (lot + cover joined). */
type ConversationJoinedRow = Conversation & { lot: LotRowWithMedia };

/** Exactly the surface ConversationsRepository/CHT-001 tests use: welcome-message
 * create + direct row assertions in specs. */
type MessageCreateData = {
  conversationId: string;
  senderId?: string | null;
  type?: MessageType;
  body?: string | null;
  mediaAssetId?: string | null;
  replyToId?: string | null;
  readAt?: Date | null;
};
type MessageWhere = { conversationId?: string; senderId?: string | null };
type MessageOrderBy = Record<string, 'asc' | 'desc'>;

/**
 * Deterministic in-memory Prisma stand-in covering exactly the surface this app
 * uses (user + refreshToken + otpCode + category + profile + profileInterest
 * tables, interactive $transaction, $queryRaw). Lets unit and e2e suites run
 * green without a database.
 */
export class FakePrisma {
  private readonly users = new Map<string, User>();
  private readonly refreshTokens = new Map<string, RefreshTokenRow>();
  private readonly otpCodes = new Map<string, OtpCode>();
  private readonly categories = new Map<string, Category>();
  private readonly profiles = new Map<string, Profile>();
  private readonly profileInterests = new Map<string, ProfileInterest>();
  private readonly lots = new Map<string, Lot>();
  private readonly lotMediaRows = new Map<string, LotMedia>();
  private readonly mediaAssets = new Map<string, MediaAsset>();
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, Message>();

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
        onboardingCompletedAt: (data.onboardingCompletedAt as Date | null | undefined) ?? null,
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
        ...(data.onboardingCompletedAt !== undefined
          ? { onboardingCompletedAt: data.onboardingCompletedAt as Date | null }
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
    /** Partial update (CAT-004 admin writes) — undefined keys stay untouched. */
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: {
        nameFa?: string;
        nameEn?: string | null;
        slug?: string;
        parentId?: string | null;
        sortOrder?: number;
        isActive?: boolean;
      };
    }): Promise<Category> => {
      const row = this.categories.get(where.id);
      if (!row) {
        throw new Error(`FakePrisma: category ${where.id} not found`);
      }
      const next: Category = {
        ...row,
        ...(data.nameFa !== undefined ? { nameFa: data.nameFa } : {}),
        ...(data.nameEn !== undefined ? { nameEn: data.nameEn } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedAt: nowIso(),
      };
      this.categories.set(row.id, next);
      return cloneCategory(next);
    },
  };

  /** Exactly the surface ProfilesRepository uses (ONB-001 + MKT-004 sellers). */
  readonly profile = {
    /** MKT-004 sellers listing: isSeller rows, newest first, hard take. */
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where?: { isSeller?: boolean };
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
    }): Promise<Profile[]> => {
      let rows = [...this.profiles.values()].filter(
        (row) => where?.isSeller === undefined || row.isSeller === where.isSeller,
      );
      if (orderBy?.createdAt === 'desc') {
        rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } else if (orderBy?.createdAt === 'asc') {
        rows = rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      return rows.slice(0, take).map(cloneProfile);
    },
    findUnique: async ({
      where,
    }: {
      where: { userId?: string; id?: string };
    }): Promise<ProfileWithInterestsRow | null> => {
      let found: Profile | undefined;
      if (where.userId !== undefined) {
        found = [...this.profiles.values()].find((row) => row.userId === where.userId);
      } else if (where.id !== undefined) {
        found = this.profiles.get(where.id);
      }
      if (!found) {
        return null;
      }
      const interests = [...this.profileInterests.values()]
        .filter((row) => row.profileId === found.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((row) => {
          const category = this.categories.get(row.categoryId);
          if (!category) {
            throw new Error(`FakePrisma: interest ${row.id} references a missing category`);
          }
          return { ...cloneInterest(row), category: cloneCategory(category) };
        });
      return { ...cloneProfile(found), interests };
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { userId: string };
      create: { userId: string } & ProfileUpsertData;
      update: ProfileUpsertData;
    }): Promise<Profile> => {
      const existing = [...this.profiles.values()].find((row) => row.userId === where.userId);
      if (!existing) {
        const row: Profile = {
          id: randomUUID(),
          ...create,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        this.profiles.set(row.id, row);
        return cloneProfile(row);
      }
      const next: Profile = { ...existing, ...update, updatedAt: nowIso() };
      this.profiles.set(existing.id, next);
      return cloneProfile(next);
    },
    /** Partial update (PATCH /profiles/me) — undefined keys stay untouched. */
    update: async ({
      where,
      data,
    }: {
      where: { userId: string };
      data: Partial<ProfileUpsertData>;
    }): Promise<Profile> => {
      const existing = [...this.profiles.values()].find((row) => row.userId === where.userId);
      if (!existing) {
        throw new Error(`FakePrisma: profile for user ${where.userId} not found`);
      }
      const next: Profile = { ...existing, updatedAt: nowIso() };
      if (data.displayName !== undefined) next.displayName = data.displayName;
      if (data.businessName !== undefined) next.businessName = data.businessName;
      if (data.province !== undefined) next.province = data.province;
      if (data.city !== undefined) next.city = data.city;
      if (data.bio !== undefined) next.bio = data.bio;
      if (data.instagram !== undefined) next.instagram = data.instagram;
      if (data.website !== undefined) next.website = data.website;
      if (data.isBuyer !== undefined) next.isBuyer = data.isBuyer;
      if (data.isSeller !== undefined) next.isSeller = data.isSeller;
      if (data.sellerYearsActive !== undefined) next.sellerYearsActive = data.sellerYearsActive;
      if (data.sellerBusinessType !== undefined) {
        next.sellerBusinessType = data.sellerBusinessType;
      }
      if (data.sellerDescription !== undefined) next.sellerDescription = data.sellerDescription;
      this.profiles.set(existing.id, next);
      return cloneProfile(next);
    },
  };

  readonly profileInterest = {
    createMany: async ({
      data,
    }: {
      data: Array<{ profileId: string; categoryId: string }>;
    }): Promise<{ count: number }> => {
      for (const item of data) {
        const row: ProfileInterest = {
          id: randomUUID(),
          profileId: item.profileId,
          categoryId: item.categoryId,
          createdAt: nowIso(),
        };
        this.profileInterests.set(row.id, row);
      }
      return { count: data.length };
    },
    deleteMany: async ({ where }: { where: { profileId: string } }): Promise<{ count: number }> => {
      let count = 0;
      for (const [id, row] of this.profileInterests) {
        if (row.profileId === where.profileId) {
          this.profileInterests.delete(id);
          count += 1;
        }
      }
      return { count };
    },
  };

  /** Exactly the surface LotsRepository uses (LOT-001). Lots always read back
   * with their gallery links joined (the production LOT_MEDIA_INCLUDE — MEDIA-005
   * responses carry media[] from every owner read/write). */
  readonly lot = {
    findMany: async ({
      where,
      orderBy,
      skip = 0,
      take,
    }: {
      where?: LotWhere;
      orderBy?: LotOrderBy;
      skip?: number;
      take?: number;
    }): Promise<LotRowWithMedia[]> => {
      const rows = [...this.lots.values()].filter(matchesLotWhere(where));
      return sortRows(rows, orderBy)
        .slice(skip, take !== undefined ? skip + take : undefined)
        .map((row) => this.withMedia(row));
    },
    count: async ({ where }: { where?: LotWhere } = {}): Promise<number> =>
      [...this.lots.values()].filter(matchesLotWhere(where)).length,
    findUnique: async ({
      where,
    }: {
      where: { id?: string; code?: string };
    }): Promise<LotRowWithMedia | null> => {
      let found: Lot | undefined;
      if (where.id !== undefined) {
        found = this.lots.get(where.id);
      } else if (where.code !== undefined) {
        found = [...this.lots.values()].find((row) => row.code === where.code);
      }
      return found ? this.withMedia(found) : null;
    },
    findFirst: async ({ where }: { where?: LotWhere }): Promise<LotRowWithMedia | null> => {
      const found = [...this.lots.values()].find(matchesLotWhere(where));
      return found ? this.withMedia(found) : null;
    },
    create: async ({ data }: { data: LotCreateData }): Promise<LotRowWithMedia> => {
      const row = buildLotRow(data);
      this.lots.set(row.id, row);
      return this.withMedia(row);
    },
    /** Partial update — undefined keys stay untouched, {increment} mutates counters. */
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: LotUpdateData;
    }): Promise<LotRowWithMedia> => {
      const row = this.lots.get(where.id);
      if (!row) {
        throw new Error(`FakePrisma: lot ${where.id} not found`);
      }
      const next: Lot = { ...row };
      for (const [key, value] of Object.entries(data) as Array<[keyof LotUpdateData, unknown]>) {
        if (value === undefined) {
          continue;
        }
        if (
          (key === 'viewCount' || key === 'saveCount') &&
          typeof value === 'object' &&
          value !== null &&
          'increment' in value
        ) {
          next[key] = row[key] + (value as { increment: number }).increment;
        } else {
          (next as Record<string, unknown>)[key] = value;
        }
      }
      next.updatedAt = nowIso();
      this.lots.set(row.id, next);
      return this.withMedia(next);
    },
    /**
     * Batch update over the two shapes the app uses: atomic counter bumps
     * (incrementCounters, where = {id}) and the LOT-006 expiry sweep
     * (where = status ACTIVE + expiresAt lt + deletedAt null → status
     * EXPIRED). Semantics mirror Prisma: unmatched rows contribute 0 to the
     * count, matched rows are mutated in place and bump updatedAt.
     */
    updateMany: async ({
      where,
      data,
    }: {
      where?: LotWhere;
      data: LotUpdateData;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const [, row] of this.lots) {
        if (!matchesLotWhere(where)(row)) {
          continue;
        }
        for (const [key, value] of Object.entries(data) as Array<[keyof LotUpdateData, unknown]>) {
          if (value === undefined) {
            continue;
          }
          if (
            (key === 'viewCount' || key === 'saveCount') &&
            typeof value === 'object' &&
            value !== null &&
            'increment' in value
          ) {
            row[key] = row[key] + (value as { increment: number }).increment;
          } else {
            (row as Record<string, unknown>)[key] = value;
          }
        }
        row.updatedAt = nowIso();
        count += 1;
      }
      return { count };
    },
    /**
     * PROF-002 categories aggregation (LotsRepository.countActiveByCategory):
     * grouped count over the matching rows, mirroring Prisma's
     * `groupBy: ['categoryId'], _count: { _all: true }` result shape. Rows are
     * returned in first-seen insertion order — the service owns the final
     * ordering (count desc, then nameFa), so this fake stays order-free.
     */
    groupBy: async ({
      where,
    }: {
      by?: Array<'categoryId'>;
      where?: LotWhere;
    }): Promise<Array<{ categoryId: string; _count: { _all: number } }>> => {
      const counts = new Map<string, number>();
      for (const row of [...this.lots.values()].filter(matchesLotWhere(where))) {
        counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + 1);
      }
      return [...counts.entries()].map(([categoryId, total]) => ({
        categoryId,
        _count: { _all: total },
      }));
    },
  };

  /** Exactly the surface LotsRepository's gallery methods use (MEDIA-005). */
  readonly lotMedia = {
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: LotMediaWhere;
      orderBy?: Record<string, 'asc' | 'desc'>;
    }): Promise<LotMediaRow[]> => {
      let rows = [...this.lotMediaRows.values()].filter(matchesLotMediaWhere(where));
      if (orderBy?.sortOrder === 'desc') {
        rows = rows.sort((a, b) => b.sortOrder - a.sortOrder);
      } else if (orderBy?.sortOrder === 'asc') {
        rows = rows.sort((a, b) => a.sortOrder - b.sortOrder);
      }
      return rows.map((row) => this.withAsset(row));
    },
    deleteMany: async ({ where }: { where: LotMediaWhere }): Promise<{ count: number }> => {
      let count = 0;
      for (const [id, row] of this.lotMediaRows) {
        if (matchesLotMediaWhere(where)(row)) {
          this.lotMediaRows.delete(id);
          count += 1;
        }
      }
      return { count };
    },
    upsert: async ({ where, create, update }: LotMediaUpsertInput): Promise<LotMediaRow> => {
      const existing = [...this.lotMediaRows.values()].find(
        (row) =>
          row.lotId === where.lotId_mediaAssetId.lotId &&
          row.mediaAssetId === where.lotId_mediaAssetId.mediaAssetId,
      );
      if (!existing) {
        const row: LotMedia = {
          id: randomUUID(),
          lotId: create.lotId,
          mediaAssetId: create.mediaAssetId,
          sortOrder: create.sortOrder,
          isCover: create.isCover,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        this.lotMediaRows.set(row.id, row);
        return this.withAsset(row);
      }
      const next: LotMedia = {
        ...existing,
        sortOrder: update.sortOrder,
        isCover: update.isCover,
        updatedAt: nowIso(),
      };
      this.lotMediaRows.set(existing.id, next);
      return this.withAsset(next);
    },
  };

  /** Exactly the surface ConversationsRepository uses (CHT-001). Reads always
   * come back with the lot joined (via withMedia — seller/gallery included,
   * which structurally carries the cover link the response mapper picks). */
  readonly conversation = {
    findUnique: async ({
      where,
    }: ConversationFindUniqueArgs): Promise<ConversationJoinedRow | null> => {
      const found = [...this.conversations.values()].find(matchesConversationWhere(where));
      return found ? this.withConversationLot(found) : null;
    },
    create: async ({ data }: { data: ConversationCreateData }): Promise<ConversationJoinedRow> => {
      const duplicate = [...this.conversations.values()].find(
        (row) => row.lotId === data.lotId && row.buyerId === data.buyerId,
      );
      if (duplicate) {
        // Mirror the real client: PrismaClientKnownRequestError carries .code.
        const error = new Error('Unique constraint failed on (lotId, buyerId)') as Error & {
          code: string;
        };
        error.code = 'P2002';
        throw error;
      }
      const row: Conversation = {
        id: randomUUID(),
        lotId: data.lotId,
        buyerId: data.buyerId,
        sellerId: data.sellerId,
        status: data.status ?? ConversationStatus.ACTIVE,
        lastMessageAt: data.lastMessageAt,
        lastMessagePreview: data.lastMessagePreview ?? null,
        buyerUnreadCount: data.buyerUnreadCount ?? 0,
        sellerUnreadCount: data.sellerUnreadCount ?? 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      this.conversations.set(row.id, row);
      return this.withConversationLot(row);
    },
  };

  /** Exactly the surface CHT-001 (welcome message) + spec assertions use. */
  readonly message = {
    create: async ({ data }: { data: MessageCreateData }): Promise<Message> => {
      const conversation = this.conversations.get(data.conversationId);
      if (!conversation) {
        throw new Error(
          `FakePrisma: message references missing conversation ${data.conversationId}`,
        );
      }
      const row: Message = {
        id: randomUUID(),
        conversationId: data.conversationId,
        senderId: data.senderId ?? null,
        type: data.type ?? MessageType.TEXT,
        body: data.body ?? null,
        mediaAssetId: data.mediaAssetId ?? null,
        replyToId: data.replyToId ?? null,
        readAt: data.readAt ?? null,
        createdAt: nowIso(),
      };
      this.messages.set(row.id, row);
      return cloneMessage(row);
    },
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: MessageWhere;
      orderBy?: MessageOrderBy;
    } = {}): Promise<Message[]> => {
      let rows = [...this.messages.values()].filter(matchesMessageWhere(where));
      if (orderBy?.createdAt === 'desc') {
        rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      } else if (orderBy?.createdAt === 'asc') {
        rows = rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      return rows.map(cloneMessage);
    },
    count: async ({ where }: { where?: MessageWhere } = {}): Promise<number> =>
      [...this.messages.values()].filter(matchesMessageWhere(where)).length,
  };

  /** Exactly the surface MediaRepository uses (MEDIA-001 + MEDIA-002 quota +
   * MEDIA-005 batch id lookup). */
  readonly mediaAsset = {
    findUnique: async ({ where }: { where: MediaAssetWhere }): Promise<MediaAsset | null> => {
      let found: MediaAsset | undefined;
      if (where.id !== undefined) {
        found = this.mediaAssets.get(where.id);
      } else if (where.storageKey !== undefined) {
        found = [...this.mediaAssets.values()].find((row) => row.storageKey === where.storageKey);
      }
      return found ? cloneMediaAsset(found) : null;
    },
    findMany: async ({ where }: { where?: { id?: { in: string[] } } } = {}): Promise<
      MediaAsset[]
    > =>
      [...this.mediaAssets.values()]
        .filter((row) => where?.id === undefined || where.id.in.includes(row.id))
        .map(cloneMediaAsset),
    count: async ({ where }: { where?: MediaAssetWhere } = {}): Promise<number> =>
      [...this.mediaAssets.values()].filter(matchesMediaAssetWhere(where)).length,
    create: async ({ data }: { data: MediaAssetCreateData }): Promise<MediaAsset> => {
      const row = buildMediaAssetRow(data);
      this.mediaAssets.set(row.id, row);
      return cloneMediaAsset(row);
    },
    delete: async ({ where }: { where: { id: string } }): Promise<MediaAsset> => {
      const row = this.mediaAssets.get(where.id);
      if (!row) {
        throw new Error(`FakePrisma: mediaAsset ${where.id} not found`);
      }
      this.mediaAssets.delete(where.id);
      return cloneMediaAsset(row);
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }

  /**
   * Health checks return the `[{ ok: 1 }]` stub; the MKT-003 lot-search
   * prequery (LotsRepository.buildLotSearchSql — the one raw query marked
   * with LOT_SEARCH_SQL_MARKER) is EMULATED over the in-memory rows. The
   * SQL's scalar CTE pins the contract: values[0..2] are exactly
   * [now, containsPattern, prefixPattern] regardless of how many replace()
   * pairs the shared FA_QUERY_REPLACEMENTS table carries. Matching semantics
   * mirror the production SQL: ILIKE (case-insensitive) over NORMALIZED
   * title/description/businessName/category+sub nameFa/city with the
   * visibility core applied; LIKE wildcards honored literally via a
   * pattern→RegExp translation.
   */
  async $queryRaw(query?: unknown): Promise<unknown[]> {
    const sql = query as { text?: unknown; values?: unknown } | undefined;
    if (
      typeof sql === 'object' &&
      sql !== null &&
      typeof sql.text === 'string' &&
      sql.text.includes(LOT_SEARCH_SQL_MARKER) &&
      Array.isArray(sql.values)
    ) {
      const [now, containsPattern, prefixPattern] = sql.values as [Date, string, string];
      return this.runLotSearch(now, containsPattern, prefixPattern);
    }
    return [{ ok: 1 }];
  }

  /** The in-memory equivalent of the MKT-003 search prequery (see $queryRaw). */
  private runLotSearch(
    now: Date,
    containsPattern: string,
    prefixPattern: string,
  ): Array<{ id: string; titlePrefix: boolean }> {
    const contains = likePatternToRegExp(containsPattern);
    const prefix = likePatternToRegExp(prefixPattern);
    const cutoff = new Date(now).getTime();
    return [...this.lots.values()]
      .filter(
        (lot) =>
          lot.status === LotStatus.ACTIVE &&
          new Date(lot.expiresAt).getTime() > cutoff &&
          lot.deletedAt === null,
      )
      .filter((lot) => {
        const seller = [...this.users.values()].find((user) => user.id === lot.sellerId);
        const profile = seller
          ? [...this.profiles.values()].find((candidate) => candidate.userId === seller.id)
          : undefined;
        const category = this.categories.get(lot.categoryId);
        const subcategory =
          lot.subcategoryId === null ? undefined : this.categories.get(lot.subcategoryId);
        // NULL arms never match (production: NULL ILIKE … is not true).
        return [
          lot.title,
          lot.description,
          profile?.businessName ?? null,
          category?.nameFa ?? null,
          subcategory?.nameFa ?? null,
          lot.city,
        ].some((text) => text !== null && contains.test(normalizeFaQuery(text)));
      })
      .sort((a, b) => {
        // ORDER BY "titlePrefix" DESC, l."createdAt" DESC, l."id" ASC
        const aPrefix = prefix.test(normalizeFaQuery(a.title));
        const bPrefix = prefix.test(normalizeFaQuery(b.title));
        if (aPrefix !== bPrefix) {
          return aPrefix ? -1 : 1;
        }
        const aCreated = new Date(a.createdAt).getTime();
        const bCreated = new Date(b.createdAt).getTime();
        if (aCreated !== bCreated) {
          return bCreated - aCreated;
        }
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      })
      .map((lot) => ({ id: lot.id, titlePrefix: prefix.test(normalizeFaQuery(lot.title)) }));
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
      onboardingCompletedAt?: Date | null;
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
      onboardingCompletedAt: user.onboardingCompletedAt ?? null,
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

  /** Test helper: pre-onboarded profile (GET /profiles/me fixtures). `createdAt`
   * controls the newest-first order the MKT-004 sellers listing returns. */
  seedProfile(profile: {
    userId: string;
    displayName: string;
    businessName?: string | null;
    province?: string | null;
    city?: string | null;
    bio?: string | null;
    instagram?: string | null;
    website?: string | null;
    isBuyer?: boolean;
    isSeller?: boolean;
    sellerYearsActive?: number | null;
    sellerBusinessType?: string | null;
    sellerDescription?: string | null;
    interestCategoryIds?: string[];
    createdAt?: Date;
  }): ProfileWithInterestsRow {
    const row: Profile = {
      id: randomUUID(),
      userId: profile.userId,
      displayName: profile.displayName,
      businessName: profile.businessName ?? null,
      province: profile.province ?? null,
      city: profile.city ?? null,
      bio: profile.bio ?? null,
      instagram: profile.instagram ?? null,
      website: profile.website ?? null,
      isBuyer: profile.isBuyer ?? false,
      isSeller: profile.isSeller ?? false,
      sellerYearsActive: profile.sellerYearsActive ?? null,
      sellerBusinessType: profile.sellerBusinessType ?? null,
      sellerDescription: profile.sellerDescription ?? null,
      createdAt: profile.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    this.profiles.set(row.id, row);
    for (const categoryId of profile.interestCategoryIds ?? []) {
      const interest: ProfileInterest = {
        id: randomUUID(),
        profileId: row.id,
        categoryId,
        createdAt: nowIso(),
      };
      this.profileInterests.set(interest.id, interest);
    }
    const interests = [...this.profileInterests.values()]
      .filter((interest) => interest.profileId === row.id)
      .map((interest) => {
        const category = this.categories.get(interest.categoryId);
        if (!category) {
          throw new Error(`FakePrisma: interest ${interest.id} references a missing category`);
        }
        return { ...cloneInterest(interest), category: cloneCategory(category) };
      });
    return { ...cloneProfile(row), interests };
  }

  /** Test helper: seeded lots with controlled status/expiry/counters (LOT-001 suites). */
  seedLot(
    lot: Omit<LotCreateData, 'code' | 'description'> & {
      code?: string;
      description?: string;
      createdAt?: Date;
    },
  ): LotRowWithMedia {
    const { createdAt, ...data } = lot;
    const row = buildLotRow({
      ...data,
      code: data.code ?? randomUUID().replace(/-/g, '').slice(0, 8),
      description: data.description ?? 'seeded lot description',
    });
    if (createdAt !== undefined) {
      row.createdAt = createdAt;
    }
    this.lots.set(row.id, row);
    return this.withMedia(row);
  }

  /** Test helper: seeded media assets (MEDIA-001 serving suites — pair with a
   * real file written through the app's StorageService driver). */
  seedMediaAsset(
    asset: Omit<MediaAssetCreateData, 'storageKey'> & {
      storageKey?: string;
      createdAt?: Date;
    },
  ): MediaAsset {
    const { createdAt, ...data } = asset;
    const row = buildMediaAssetRow({
      ...data,
      storageKey:
        data.storageKey ??
        `2026/01/${randomUUID().replace(/-/g, '').slice(0, 24).toLowerCase()}.jpg`,
    });
    if (createdAt !== undefined) {
      row.createdAt = createdAt;
    }
    this.mediaAssets.set(row.id, row);
    return cloneMediaAsset(row);
  }

  /** Test helper: seeded gallery links (MEDIA-005 suites — pair with seedLot +
   * seedMediaAsset rows). */
  seedLotMedia(link: {
    lotId: string;
    mediaAssetId: string;
    sortOrder: number;
    isCover?: boolean;
  }): LotMedia {
    const row: LotMedia = {
      id: randomUUID(),
      lotId: link.lotId,
      mediaAssetId: link.mediaAssetId,
      sortOrder: link.sortOrder,
      isCover: link.isCover ?? false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.lotMediaRows.set(row.id, row);
    return cloneLotMedia(row);
  }

  /** Lot row with its relations joined (seller summary + gallery sorted by
   * sortOrder + category NAME rows), mirroring the production includes
   * (LOT_MEDIA_INCLUDE / LOT_CARD_INCLUDE / LOT_PUBLIC_DETAIL_INCLUDE).
   * Throws on a link whose asset row is missing — seeded fixtures are
   * expected to be consistent; the seller join is lenient (see LotSellerRow)
   * and missing category rows degrade to an id-only stub (specs seed
   * historical/unknown category ids deliberately). */
  private withMedia(row: Lot): LotRowWithMedia {
    const sellerUser = [...this.users.values()].find((user) => user.id === row.sellerId);
    const profile = sellerUser
      ? ([...this.profiles.values()].find((candidate) => candidate.userId === sellerUser.id) ??
        null)
      : null;
    const media = [...this.lotMediaRows.values()]
      .filter((link) => link.lotId === row.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((link) => this.withAsset(link));
    const category = this.categories.get(row.categoryId);
    const subcategory = row.subcategoryId ?? undefined;
    return {
      ...cloneLot(row),
      seller: {
        id: row.sellerId,
        name: sellerUser?.name ?? '',
        profile: profile ? { businessName: profile.businessName, city: profile.city } : null,
      },
      media,
      category: category ? cloneCategory(category) : categoryStub(row.categoryId),
      subcategory:
        subcategory === undefined
          ? null
          : (this.categories.get(subcategory) ?? categoryStub(subcategory)),
    };
  }

  /** LotMedia row with its asset joined (the gallery include's element shape). */
  private withAsset(row: LotMedia): LotMediaRow {
    const asset = this.mediaAssets.get(row.mediaAssetId);
    if (!asset) {
      throw new Error(`FakePrisma: lotMedia ${row.id} references a missing mediaAsset`);
    }
    return { ...cloneLotMedia(row), mediaAsset: cloneMediaAsset(asset) };
  }

  /** Conversation row with its lot joined (withMedia — the repository's
   * CONVERSATION_LOT_INCLUDE covers the same lot data the response needs). */
  private withConversationLot(row: Conversation): ConversationJoinedRow {
    const lot = this.lots.get(row.lotId);
    if (!lot) {
      throw new Error(`FakePrisma: conversation ${row.id} references a missing lot`);
    }
    return { ...cloneConversation(row), lot: this.withMedia(lot) };
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
    (where?.parentId === undefined || row.parentId === where.parentId) &&
    (where?.id === undefined || where.id.in.includes(row.id));
}

/** Multi-key stable sort (orderBy is a single object or an array of them). */
function sortRows<T extends Category | User | Lot>(
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

/** Lenient id-only Category row for lots whose categoryId has no seeded row —
 * specs seed historical/unknown category ids deliberately (LOT-002 400s). */
function categoryStub(id: string): Category {
  return {
    id,
    nameFa: '',
    nameEn: null,
    slug: '',
    parentId: null,
    sortOrder: 0,
    isActive: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

/** Full Lot row from the create payload, applying DB defaults (LOT-001). */
function buildLotRow(data: LotCreateData): Lot {
  const now = nowIso();
  return {
    id: randomUUID(),
    code: data.code,
    sellerId: data.sellerId,
    categoryId: data.categoryId,
    subcategoryId: data.subcategoryId ?? null,
    title: data.title,
    description: data.description,
    quantity: data.quantity,
    unit: data.unit ?? LotUnit.PIECE,
    availableQuantity: data.availableQuantity,
    minOrderQuantity: data.minOrderQuantity,
    pricingType: data.pricingType,
    totalPrice: data.totalPrice,
    unitPrice: data.unitPrice,
    condition: data.condition,
    liquidationReason: data.liquidationReason,
    province: data.province,
    city: data.city,
    locationHint: data.locationHint ?? null,
    exactAddress: data.exactAddress ?? null,
    status: data.status ?? LotStatus.DRAFT,
    rejectionReason: data.rejectionReason ?? null,
    viewCount: data.viewCount ?? 0,
    saveCount: data.saveCount ?? 0,
    expiresAt: data.expiresAt,
    publishedAt: data.publishedAt ?? null,
    soldAt: data.soldAt ?? null,
    featuredAt: data.featuredAt ?? null,
    deletedAt: data.deletedAt ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function matchesLotWhere(where: LotWhere | undefined): (row: Lot) => boolean {
  const matchesId = (row: Lot): boolean => {
    const id = where?.id;
    if (id === undefined) {
      return true;
    }
    if (typeof id === 'string') {
      return row.id === id;
    }
    if (id.in !== undefined && !id.in.includes(row.id)) {
      return false;
    }
    return id.not === undefined || row.id !== id.not;
  };
  return (row) =>
    matchesId(row) &&
    (where?.code === undefined || row.code === where.code) &&
    (where?.sellerId === undefined || row.sellerId === where.sellerId) &&
    (where?.categoryId === undefined || row.categoryId === where.categoryId) &&
    (where?.subcategoryId === undefined || row.subcategoryId === where.subcategoryId) &&
    (where?.city === undefined || row.city === where.city) &&
    (where?.province === undefined || row.province === where.province) &&
    (where?.pricingType === undefined || row.pricingType === where.pricingType) &&
    (where?.condition === undefined || matchesLotEnumFilter(row.condition, where.condition)) &&
    (where?.liquidationReason === undefined ||
      matchesLotEnumFilter(row.liquidationReason, where.liquidationReason)) &&
    (where?.status === undefined || matchesLotEnumFilter(row.status, where.status)) &&
    (where?.unitPrice === undefined ||
      ((where.unitPrice.gte === undefined || row.unitPrice >= where.unitPrice.gte) &&
        (where.unitPrice.lte === undefined || row.unitPrice <= where.unitPrice.lte))) &&
    (where?.quantity === undefined ||
      ((where.quantity.gte === undefined || row.quantity >= where.quantity.gte) &&
        (where.quantity.lte === undefined || row.quantity <= where.quantity.lte))) &&
    (where?.createdAt === undefined ||
      where.createdAt.gte === undefined ||
      row.createdAt >= where.createdAt.gte) &&
    (where?.expiresAt === undefined ||
      ((where.expiresAt.gt === undefined || row.expiresAt > where.expiresAt.gt) &&
        (where.expiresAt.lt === undefined || row.expiresAt < where.expiresAt.lt))) &&
    (where?.deletedAt === undefined || row.deletedAt === null) &&
    (where?.OR === undefined || where.OR.some((entry) => matchesLotSearchEntry(row, entry)));
}

function matchesLotEnumFilter<T extends string>(value: T, filter: LotEnumFilter<T>): boolean {
  if (typeof filter === 'string') {
    return value === filter;
  }
  if ('in' in filter) {
    return filter.in.includes(value);
  }
  return !filter.notIn.includes(value);
}

/** OR-branch matcher for the search filter (case-insensitive contains). */
function matchesLotSearchEntry(
  row: Lot,
  entry: { title?: LotTextFilter; description?: LotTextFilter },
): boolean {
  // Only the fields the branch actually carries participate — an absent field
  // must not make the branch match vacuously.
  if (entry.title !== undefined) {
    return row.title.toLowerCase().includes(entry.title.contains.toLowerCase());
  }
  if (entry.description !== undefined) {
    return row.description.toLowerCase().includes(entry.description.contains.toLowerCase());
  }
  return false;
}

function cloneLot(row: Lot): Lot {
  return {
    ...row,
    expiresAt: new Date(row.expiresAt),
    publishedAt: row.publishedAt === null ? null : new Date(row.publishedAt),
    soldAt: row.soldAt === null ? null : new Date(row.soldAt),
    featuredAt: row.featuredAt === null ? null : new Date(row.featuredAt),
    deletedAt: row.deletedAt === null ? null : new Date(row.deletedAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/** Full MediaAsset row from the create payload, applying DB defaults (MEDIA-001). */
function buildMediaAssetRow(data: MediaAssetCreateData): MediaAsset {
  const now = nowIso();
  return {
    id: randomUUID(),
    ownerId: data.ownerId,
    type: data.type,
    storageKey: data.storageKey,
    thumbKey: data.thumbKey ?? null,
    mime: data.mime,
    sizeBytes: data.sizeBytes,
    width: data.width ?? null,
    height: data.height ?? null,
    durationMs: data.durationMs ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function cloneMediaAsset(row: MediaAsset): MediaAsset {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/** MEDIA-002 quota matcher: owner scoping + optional createdAt lower bound. */
function matchesMediaAssetWhere(where: MediaAssetWhere | undefined): (row: MediaAsset) => boolean {
  return (row) =>
    (where?.id === undefined || row.id === where.id) &&
    (where?.storageKey === undefined || row.storageKey === where.storageKey) &&
    (where?.ownerId === undefined || row.ownerId === where.ownerId) &&
    (where?.createdAt === undefined ||
      where.createdAt.gte === undefined ||
      row.createdAt >= where.createdAt.gte);
}

/** MEDIA-005 gallery matcher: lot scoping + the deleteMany `notIn` asset set. */
function matchesLotMediaWhere(where: LotMediaWhere | undefined): (row: LotMedia) => boolean {
  return (row) =>
    (where?.lotId === undefined || row.lotId === where.lotId) &&
    (where?.mediaAssetId === undefined || !where.mediaAssetId.notIn.includes(row.mediaAssetId));
}

function cloneLotMedia(row: LotMedia): LotMedia {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/** CHT-001 conversation matcher: unique-key lookup surface only. */
function matchesConversationWhere(
  where: { id?: string; lotId_buyerId?: { lotId: string; buyerId: string } } | undefined,
): (row: Conversation) => boolean {
  return (row) =>
    (where?.id === undefined || row.id === where.id) &&
    (where?.lotId_buyerId === undefined ||
      (row.lotId === where.lotId_buyerId.lotId && row.buyerId === where.lotId_buyerId.buyerId));
}

function cloneConversation(row: Conversation): Conversation {
  return {
    ...row,
    lastMessageAt: new Date(row.lastMessageAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/** Message matcher: thread scoping + optional sender (null matches SYSTEM rows). */
function matchesMessageWhere(where: MessageWhere | undefined): (row: Message) => boolean {
  return (row) =>
    (where?.conversationId === undefined || row.conversationId === where.conversationId) &&
    (where?.senderId === undefined || row.senderId === where.senderId);
}

function cloneMessage(row: Message): Message {
  return {
    ...row,
    readAt: row.readAt === null ? null : new Date(row.readAt),
    createdAt: new Date(row.createdAt),
  };
}

function cloneProfile(row: Profile): Profile {
  return { ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
}

/**
 * Translate a SQL LIKE/ILIKE pattern (as bound by LotsRepository — user
 * wildcards already escaped with `\`) into an anchored RegExp with ILIKE's
 * case-insensitivity: `%` → any run, `_` → exactly one character, `\x` →
 * literal x, everything else literal (regex-metas escaped).
 */
function likePatternToRegExp(pattern: string): RegExp {
  const escapeRegexMeta = (literal: string) => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i] as string;
    if (char === '\\' && i + 1 < pattern.length) {
      i += 1;
      source += escapeRegexMeta(pattern[i] as string);
    } else if (char === '%') {
      source += '[\\s\\S]*';
    } else if (char === '_') {
      source += '[\\s\\S]';
    } else {
      source += escapeRegexMeta(char);
    }
  }
  return new RegExp(`^${source}$`, 'i');
}

function cloneInterest(row: ProfileInterest): ProfileInterest {
  return { ...row, createdAt: new Date(row.createdAt) };
}
