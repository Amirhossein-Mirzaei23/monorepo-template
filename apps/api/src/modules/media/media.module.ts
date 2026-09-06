import { Module } from '@nestjs/common';
import { ImageVariantService } from './images/variant.service';
import { MediaController } from './media.controller';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';
import { LocalDiskDriver } from './storage/local-disk.driver';
import { StorageService } from './storage/storage.service';

/**
 * Media domain module (MEDIA-001 serving + MEDIA-002 image uploads):
 * StorageService abstraction + local-disk driver, MediaAsset repository, the
 * public/secure serving endpoints and the POST /media upload pipeline
 * (magic-byte verification, quota, sharp variants). MEDIA-003 (video) and
 * MEDIA-005 (LotMedia) build on this module — MediaService, the repository
 * and the StorageService driver are exported so sibling modules inject the
 * configured driver, never the filesystem directly.
 */
@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    ImageVariantService,
    MediaRepository,
    // Driver swap point (MEDIA-006 S3Driver + STORAGE_DRIVER switch).
    { provide: StorageService, useClass: LocalDiskDriver },
  ],
  exports: [MediaService, MediaRepository, StorageService],
})
export class MediaModule {}
