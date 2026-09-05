import { Injectable } from '@nestjs/common';
import type { OtpCode, OtpPurpose, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Data for a new OTP row — the service computes policy (hash, expiry, caps). */
export interface CreateOtpCodeData {
  phone: string;
  codeHash: string;
  purpose: OtpPurpose;
  lastSentAt: Date;
  expiresAt: Date;
}

type Tx = Prisma.TransactionClient | undefined;

/**
 * Data access only. Every method accepts an optional transaction client so the
 * repository stays unit-of-work agnostic — services own transaction boundaries
 * (doc/CONVENTIONS.md → Transactions). Repositories never call $transaction.
 */
@Injectable()
export class OtpRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx: Tx): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  /** Codes sent to this phone at or after `since` — the per-phone send-cap counter. */
  async countSentSince(phone: string, since: Date, tx: Tx = undefined): Promise<number> {
    return this.client(tx).otpCode.count({ where: { phone, lastSentAt: { gte: since } } });
  }

  /** Earliest send still inside the window — drives the 429 retry-after hint. */
  async findEarliestSentSince(
    phone: string,
    since: Date,
    tx: Tx = undefined,
  ): Promise<OtpCode | null> {
    return this.client(tx).otpCode.findFirst({
      where: { phone, lastSentAt: { gte: since } },
      orderBy: { lastSentAt: 'asc' },
    });
  }

  /** The unconsumed, unexpired code for phone+purpose, latest first (belt-and-braces: the partial unique index already guarantees one). */
  async findActive(
    phone: string,
    purpose: OtpPurpose,
    now: Date,
    tx: Tx = undefined,
  ): Promise<OtpCode | null> {
    return this.client(tx).otpCode.findFirst({
      where: { phone, purpose, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: CreateOtpCodeData, tx: Tx = undefined): Promise<OtpCode> {
    return this.client(tx).otpCode.create({ data });
  }

  /** Consume every unconsumed code for phone+purpose — a new request invalidates them. */
  async invalidateActiveCodes(
    phone: string,
    purpose: OtpPurpose,
    consumedAt: Date,
    tx: Tx = undefined,
  ): Promise<number> {
    const result = await this.client(tx).otpCode.updateMany({
      where: { phone, purpose, consumedAt: null },
      data: { consumedAt },
    });
    return result.count;
  }

  /** Atomic attempt-counter bump on a wrong submission. */
  async incrementAttempts(id: string, tx: Tx = undefined): Promise<OtpCode> {
    return this.client(tx).otpCode.update({ where: { id }, data: { attempts: { increment: 1 } } });
  }

  /** Consume-once: true only when this call flipped the row from active to consumed. */
  async consume(id: string, consumedAt: Date, tx: Tx = undefined): Promise<boolean> {
    const result = await this.client(tx).otpCode.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt },
    });
    return result.count === 1;
  }
}
