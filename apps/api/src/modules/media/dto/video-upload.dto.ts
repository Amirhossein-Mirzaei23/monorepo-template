import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * MEDIA-003 multipart TEXT fields of POST /media/video (the files `video` and
 * `poster` are bound by FileFieldsInterceptor, not by this DTO — multer puts
 * non-file form fields on the body, the global ValidationPipe transforms and
 * whitelists them). `durationMs` is what the CLIENT measured while recording;
 * for mp4 the server re-parses the mvhd box and its value WINS, so a lying
 * client cannot stretch the 60 s rule — for WebM (no cheap in-band duration,
 * decision D10) the client value is trusted (documented residual risk), and
 * with NO usable duration at all the upload is rejected 400 (cannot validate).
 */
export class VideoUploadDto {
  @ApiPropertyOptional({
    type: Number,
    example: 58_000,
    description:
      'Client-measured video duration in milliseconds. Required for WebM uploads ' +
      '(and for mp4 files whose mvhd box cannot be parsed); ignored for mp4 files ' +
      'whose duration the server parses successfully. Must be a positive integer.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMs?: number;
}
