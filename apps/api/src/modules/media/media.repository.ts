import { Injectable } from '@nestjs/common';
import type { MediaAsset, MediaType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Create payload for the upload pipelines (first exercised in MEDIA-002/003). */
export interface MediaAssetCreateData {
  ownerId: string;
  type: MediaType;
  storageKey: string;
  thumbKey?: string | null;
  mime: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}

type Tx = Prisma.TransactionClient | undefined;

/**
 * Data access only (MEDIA-001). Every method accepts an optional transaction
 * client — services own transaction boundaries (doc/CONVENTIONS.md →
 * Transactions); repositories never call $transaction. MEDIA-002/003 add the
 * upload/quota reads on top of this surface.
 */
@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx: Tx): Prisma.TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }

  /**
   * O(1) lookup by storage key — the UNIQUE index on MediaAsset.storageKey is
   * what serving (GET /media/:key) resolves against.
   */
  async findByStorageKey(key: string, tx: Tx = undefined): Promise<MediaAsset | null> {
    return this.client(tx).mediaAsset.findUnique({ where: { storageKey: key } });
  }

  async findById(id: string, tx: Tx = undefined): Promise<MediaAsset | null> {
    return this.client(tx).mediaAsset.findUnique({ where: { id } });
  }

  async create(data: MediaAssetCreateData, tx: Tx = undefined): Promise<MediaAsset> {
    return this.client(tx).mediaAsset.create({
      data: {
        ownerId: data.ownerId,
        type: data.type,
        storageKey: data.storageKey,
        thumbKey: data.thumbKey,
        mime: data.mime,
        sizeBytes: data.sizeBytes,
        width: data.width,
        height: data.height,
        durationMs: data.durationMs,
      },
    });
  }

  async delete(id: string, tx: Tx = undefined): Promise<MediaAsset> {
    return this.client(tx).mediaAsset.delete({ where: { id } });
  }
}
