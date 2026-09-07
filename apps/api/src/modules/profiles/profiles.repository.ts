import { Injectable } from '@nestjs/common';
import type { Prisma, Profile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Row shape returned by the include below (interests with their category). */
export type ProfileWithInterests = Prisma.ProfileGetPayload<{
  include: { interests: { include: { category: true } } };
}>;

/** Write payload for the onboarding upsert (ONB-001; PUT = full replace). */
export interface UpsertProfileData {
  displayName: string;
  businessName: string | null;
  province: string | null;
  city: string | null;
  bio: string | null;
  instagram: string | null;
  website: string | null;
  isBuyer: boolean;
  isSeller: boolean;
  sellerYearsActive: number | null;
  sellerBusinessType: string | null;
  sellerDescription: string | null;
}

/**
 * Partial write payload for PATCH /profiles/me (PROF-001): absent keys are
 * left untouched, `null` clears an optional field (Prisma `update` semantics).
 */
export type UpdateProfileData = Partial<UpsertProfileData>;

export type Tx = Prisma.TransactionClient | undefined;

/**
 * Data access only. Every method accepts an optional transaction client so
 * the repository stays unit-of-work agnostic — services own transaction
 * boundaries (doc/CONVENTIONS.md → Transactions). Repositories never call
 * $transaction.
 */
@Injectable()
export class ProfilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx: Tx): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  /** Own-profile read: interests included, insertion order. */
  async findByUserId(userId: string, tx: Tx = undefined): Promise<ProfileWithInterests | null> {
    return this.client(tx).profile.findUnique({
      where: { userId },
      include: { interests: { include: { category: true }, orderBy: { createdAt: 'asc' } } },
    });
  }

  /**
   * 1–1 upsert keyed on the unique userId — re-onboarding is an idempotent
   * update of the same row, never a second profile (ONB-001: no 409).
   */
  async upsert(userId: string, data: UpsertProfileData, tx: Tx = undefined): Promise<Profile> {
    return this.client(tx).profile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  /** Partial update for PATCH /profiles/me — undefined keys stay untouched. */
  async updateByUserId(
    userId: string,
    data: UpdateProfileData,
    tx: Tx = undefined,
  ): Promise<Profile> {
    return this.client(tx).profile.update({ where: { userId }, data });
  }

  /**
   * Newest seller profiles (MKT-004 «تأییدشده‌ها» strip source): isSeller
   * rows only, newest first, hard `take` — the callers ask for a fixed top
   * slice (default 10, capped at 20 by the query DTO). Rows stay FULL (no
   * select): the payload allowlist lives in toPublicSellerSummary, the same
   * mapper-not-spread discipline as every other public read.
   */
  async findSellerProfiles(limit: number, tx: Tx = undefined): Promise<Profile[]> {
    return this.client(tx).profile.findMany({
      where: { isSeller: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Wholesale replacement of the interest set inside the onboarding transaction. */
  async replaceInterests(
    profileId: string,
    categoryIds: string[],
    tx: Tx = undefined,
  ): Promise<void> {
    const client = this.client(tx);
    await client.profileInterest.deleteMany({ where: { profileId } });
    if (categoryIds.length > 0) {
      await client.profileInterest.createMany({
        data: categoryIds.map((categoryId) => ({ profileId, categoryId })),
      });
    }
  }
}
