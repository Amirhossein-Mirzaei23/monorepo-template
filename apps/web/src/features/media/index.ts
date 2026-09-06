/**
 * Public API (barrel) of the media feature — the only import path other
 * modules may use (doc/ARCHITECTURE.md → Frontend rules). Reusable by the lot
 * wizard (LOT-004), chat attachments (CHT-007) and the avatar picker (PROF-004)
 * without modification (MEDIA-004 DoD).
 */
export {
  MediaUploader,
  DEFAULT_IMAGES_MAX,
  DEFAULT_VIDEOS_MAX,
  type MediaUploaderProps,
} from './components/media-uploader';
export { MediaGrid, type MediaGridProps } from './components/media-grid';
export {
  VideoRecorderModal,
  type VideoRecorderModalProps,
  type VideoRecordPayload,
} from './components/video-recorder-modal';
export { useMediaUpload, uploadImage, uploadVideo, describeUploadError } from './hooks/use-upload';
export type {
  UploadImageArgs,
  UploadVideoArgs,
  UseMediaUploadResult,
  UploadProgressListener,
} from './hooks/use-upload';
export { compressImage, CompressionError } from './lib/compress';
export type { CompressOptions } from './lib/compress';
export { captureVideoPoster, PosterCaptureError } from './lib/poster-capture';
export type { CapturePosterOptions, CapturedPoster } from './lib/poster-capture';
export {
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_DURATION_MS,
  VIDEO_ACCEPT_TYPES,
  formatVideoDuration,
} from './lib/limits';
export {
  type MediaItem,
  type MediaItemKind,
  type MediaItemStatus,
  type MediaImageUploadResponse,
  type MediaVideoUploadResponse,
} from './types';
