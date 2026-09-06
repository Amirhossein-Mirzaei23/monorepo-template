import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * Payload for PATCH /admin/categories/:id/reorder (CAT-004): the target's
 * `sortOrder` is swapped with the sibling's — "reorder = sibling sortOrder
 * swap". The sibling must share the same `parentId` (both-null counts as
 * siblings at the top level), otherwise 400.
 */
export class ReorderCategoryDto {
  @ApiProperty({
    example: 'clx…cuid',
    description: 'Sibling category id to swap sortOrder with — must be an actual sibling',
  })
  @IsString()
  siblingId!: string;
}
