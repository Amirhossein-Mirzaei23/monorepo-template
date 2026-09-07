import { Module } from '@nestjs/common';
import { ChatMediaAccessService } from './chat-media-access.service';
import { ImageVariantService } from './images/variant.service';
import { MediaController } from './media.controller';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';
import { LocalDiskDriver } from './storage/local-disk.driver';
import { StorageService } from './storage/storage.service';
import { VideoService } from './video/video.service';

/**
 * Media domain module (MEDIA-001 serving + MEDIA-002 image uploads +
 * MEDIA-003 video uploads): StorageService abstraction + local-disk driver,
 * MediaAsset repository, the public/secure serving endpoints, the
 * POST /media upload pipeline (magic-byte verification, quota, sharp
 * variants) and the POST /media/video pipeline (duration limits, client
 * poster thumb). MEDIA-005 (LotMedia) builds on this module — MediaService,
 * the repository and the StorageService driver are exported so sibling
 * modules inject the configured driver, never the filesystem directly.
 * CHT-007 adds ChatMediaAccessService: the read-only message-reference /
 * conversation-participation probes behind the secure route's participant
 * gate (see that file for the deliberate placement rationale).
 */
@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    VideoService,
    ImageVariantService,
    MediaRepository,
    ChatMediaAccessService,
    // Driver swap point (MEDIA-006 S3Driver + STORAGE_DRIVER switch).
    { provide: StorageService, useClass: LocalDiskDriver },
  ],
  exports: [MediaService, MediaRepository, StorageService],
})
export class MediaModule {}
