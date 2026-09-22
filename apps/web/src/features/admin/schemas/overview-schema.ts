import {
  adminOverviewResponseSchema,
  type AdminOverviewPendingLotDto,
  type AdminOverviewResponseDto,
} from '@monorepo/shared-types';

/**
 * Runtime contract of GET /api/admin/overview — the schema is GENERATED from
 * the API's swagger document (`npm run gen:types`), re-exported here as the
 * feature's single validation entry point. Contract drift fails loudly at
 * parse time (`parseApiResponse` in the api layer).
 */
export const adminOverviewSchema = adminOverviewResponseSchema;
export type AdminOverviewData = AdminOverviewResponseDto;
export type AdminOverviewPendingLot = AdminOverviewPendingLotDto;
