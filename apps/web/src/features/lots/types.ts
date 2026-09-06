import type { PutLotMediaDto } from '@monorepo/shared-types';

/**
 * Wire shape for PUT /lots/:id/media — identical to the API's PutLotMediaDto
 * except `coverIndex` may be omitted: the swagger DTO marks it required
 * (default 0), but the server 400s (COVER_INDEX_OUT_OF_BOUNDS) when a cover is
 * sent for an empty gallery, so clearing all media must omit it.
 */
export type LotMediaPutPayload = Omit<PutLotMediaDto, 'coverIndex'> & { coverIndex?: number };
