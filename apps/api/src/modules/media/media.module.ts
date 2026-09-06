import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';
import { LocalDiskDriver } from './storage/local-disk.driver';
import { StorageService } from './storage/storage.service';

/**
 * Media domain module (MEDIA-001): StorageService abstraction + local-disk
 * driver, MediaAsset repository, and the public/secure serving endpoints.
 * MEDIA-002/003 (uploads) and MEDIA-005 (LotMedia) build on this module —
 * both MediaService and the StorageService driver are exported so sibling
 * modules inject the configured driver, never the filesystem directly.
 */
@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaRepository,
    // Driver swap point (MEDIA-006 S3Driver + STORAGE_DRIVER switch).
    { provide: StorageService, useClass: LocalDiskDriver },
  ],
  exports: [MediaService, MediaRepository, StorageService],
})
export class MediaModule {}
