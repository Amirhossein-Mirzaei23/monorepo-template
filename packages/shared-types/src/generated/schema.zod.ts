// GENERATED from openapi.json by scripts/generate.mjs — DO NOT EDIT.
// Regenerate with `npm run gen:types` at the repo root.
/* eslint-disable */

import { z } from 'zod';
import type { components } from './schema';

export const objectSchema = z.object({

});

export const userResponseDtoSchema = z.object({
  id: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  name: z.string(),
  role: z.enum(['USER', 'ADMIN']),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BLOCKED', 'DELETED']),
  accountRoles: z.array(z.enum(['BUYER', 'SELLER'])),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createUserDtoSchema = z.object({
  phone: z.string(),
  email: z.email().nullable().optional(),
  name: z.string(),
  password: z.string(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export const updateUserDtoSchema = z.object({
  phone: z.string().optional(),
  email: z.email().nullable().optional(),
  name: z.string().optional(),
  password: z.string().optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export const otpRequestDtoSchema = z.object({
  phone: z.string(),
  clientType: z.enum(['web', 'android']).optional(),
});

export const otpRequestResponseDtoSchema = z.object({
  expiresAt: z.iso.datetime(),
  devCode: z.string().optional(),
});

export const otpVerifyDtoSchema = z.object({
  phone: z.string(),
  code: z.string(),
  clientType: z.enum(['web', 'android']).optional(),
});

export const loginDtoSchema = z.object({
  email: z.email(),
  password: z.string(),
});

export const meResponseDtoSchema = z.object({
  id: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  name: z.string(),
  role: z.enum(['USER', 'ADMIN']),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BLOCKED', 'DELETED']),
  accountRoles: z.array(z.enum(['BUYER', 'SELLER'])),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  onboardingCompleted: z.boolean(),
});

type CategoryTreeNodeDto = components['schemas']['CategoryTreeNodeDto'];
export const categoryTreeNodeDtoSchema: z.ZodType<CategoryTreeNodeDto> = z.object({
  id: z.string(),
  nameFa: z.string(),
  nameEn: z.string().nullable().optional(),
  slug: z.string(),
  children: z.array(z.lazy(() => categoryTreeNodeDtoSchema)),
});

export const createCategoryDtoSchema = z.object({
  nameFa: z.string(),
  nameEn: z.string().nullable().optional(),
  slug: z.string(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

export const categoryResponseDtoSchema = z.object({
  id: z.string(),
  nameFa: z.string(),
  nameEn: z.string().nullable().optional(),
  slug: z.string(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number(),
  isActive: z.boolean(),
});

export const updateCategoryDtoSchema = z.object({
  nameFa: z.string().optional(),
  nameEn: z.string().nullable().optional(),
  slug: z.string().optional(),
  parentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const reorderCategoryDtoSchema = z.object({
  siblingId: z.string(),
});

export const saveOnboardingDtoSchema = z.object({
  isBuyer: z.boolean(),
  isSeller: z.boolean(),
  displayName: z.string(),
  businessName: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  instagram: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  sellerYearsActive: z.number().nullable().optional(),
  sellerBusinessType: z.enum(['MANUFACTURER', 'WORKSHOP', 'WHOLESALER', 'RETAILER', 'TRADING', 'SERVICE', 'OTHER']).nullable().optional(),
  sellerDescription: z.string().nullable().optional(),
  interests: z.array(z.string()).optional(),
});

export const profileInterestCategoryDtoSchema = z.object({
  id: z.string(),
  nameFa: z.string(),
  slug: z.string(),
});

export const profileMetricsDtoSchema = z.object({
  successfulTransactions: z.number(),
  averageRating: z.number().nullable().optional(),
  ratingCount: z.number(),
  responseRateMinutes: z.number().nullable().optional(),
  cancellationRate: z.number().nullable().optional(),
  activeListings: z.number(),
});

export const updateProfileDtoSchema = z.object({
  isBuyer: z.boolean().nullable().optional(),
  isSeller: z.boolean().nullable().optional(),
  displayName: z.string().nullable().optional(),
  businessName: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  instagram: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  sellerYearsActive: z.number().nullable().optional(),
  sellerBusinessType: z.enum(['MANUFACTURER', 'WORKSHOP', 'WHOLESALER', 'RETAILER', 'TRADING', 'SERVICE', 'OTHER']).nullable().optional(),
  sellerDescription: z.string().nullable().optional(),
  interests: z.array(z.string()).optional(),
});

export const publicSellerSummaryDtoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  businessName: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  verified: z.boolean(),
});

export const sellerPublicMetricsDtoSchema = z.object({
  successfulTransactions: z.number(),
  ratingAverage: z.number().nullable(),
  ratingCount: z.number(),
  responseRateMinutes: z.number().nullable(),
  cancellationRate: z.number(),
});

export const sellerPublicCategoryDtoSchema = z.object({
  id: z.string(),
  nameFa: z.string(),
  slug: z.string(),
});

export const lotMediaResponseDtoSchema = z.object({
  id: z.string(),
  mediaAssetId: z.string(),
  kind: z.enum(['IMAGE', 'VIDEO']),
  url: z.string(),
  thumbUrl: z.string().nullable().optional(),
  sortOrder: z.number(),
  isCover: z.boolean(),
});

export const lotCardSellerDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  businessName: z.string().nullable().optional(),
});

export const createLotDtoSchema = z.object({
  title: z.string(),
  description: z.string(),
  categoryId: z.string(),
  subcategoryId: z.string().nullable().optional(),
  quantity: z.number(),
  availableQuantity: z.number().optional(),
  minOrderQuantity: z.number().optional(),
  unit: z.enum(['PIECE', 'SET', 'BOX', 'KG', 'PAIR', 'OTHER']).optional(),
  totalPrice: z.number(),
  pricingType: z.enum(['FIXED', 'NEGOTIABLE']),
  condition: z.enum(['GRADE_A', 'GRADE_B', 'GRADE_C', 'MIXED', 'NEW', 'USED', 'DAMAGED', 'NEAR_EXPIRY']),
  liquidationReason: z.enum(['EXCESS_PRODUCTION', 'CANCELLED_ORDER', 'EXPORT_RETURN', 'SEASON_CLEARANCE', 'OVERSTOCK', 'FACTORY_CLOSURE', 'PACKAGING_CHANGE', 'NEAR_EXPIRY', 'OTHER']),
  province: z.string(),
  city: z.string(),
  locationHint: z.string().nullable().optional(),
  exactAddress: z.string().nullable().optional(),
  submit: z.boolean().optional(),
});

export const lotDetailCategoryDtoSchema = z.object({
  id: z.string(),
  nameFa: z.string(),
  slug: z.string(),
});

export const lotDetailSellerDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  businessName: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  verified: z.boolean(),
});

export const updateLotDtoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  subcategoryId: z.string().nullable().optional(),
  quantity: z.number().optional(),
  availableQuantity: z.number().optional(),
  minOrderQuantity: z.number().optional(),
  unit: z.enum(['PIECE', 'SET', 'BOX', 'KG', 'PAIR', 'OTHER']).optional(),
  totalPrice: z.number().optional(),
  pricingType: z.enum(['FIXED', 'NEGOTIABLE']).optional(),
  condition: z.enum(['GRADE_A', 'GRADE_B', 'GRADE_C', 'MIXED', 'NEW', 'USED', 'DAMAGED', 'NEAR_EXPIRY']).optional(),
  liquidationReason: z.enum(['EXCESS_PRODUCTION', 'CANCELLED_ORDER', 'EXPORT_RETURN', 'SEASON_CLEARANCE', 'OVERSTOCK', 'FACTORY_CLOSURE', 'PACKAGING_CHANGE', 'NEAR_EXPIRY', 'OTHER']).optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  locationHint: z.string().nullable().optional(),
  exactAddress: z.string().nullable().optional(),
  submit: z.boolean().optional(),
});

export const putLotMediaItemDtoSchema = z.object({
  mediaAssetId: z.string(),
});

export const mediaUploadUrlsDtoSchema = z.object({
  original: z.string(),
  cover: z.string(),
  thumb: z.string(),
});

export const mediaVideoUploadUrlsDtoSchema = z.object({
  video: z.string(),
  poster: z.string().optional(),
  posterThumb: z.string().optional(),
});

export const otpVerifyResponseDtoSchema = z.object({
  accessToken: z.string(),
  user: userResponseDtoSchema,
  onboardingCompleted: z.boolean(),
});

export const loginResponseDtoSchema = z.object({
  accessToken: z.string(),
  user: userResponseDtoSchema,
});

export const profileResponseDtoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string(),
  businessName: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  instagram: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  isBuyer: z.boolean(),
  isSeller: z.boolean(),
  sellerYearsActive: z.number().nullable().optional(),
  sellerBusinessType: z.enum(['MANUFACTURER', 'WORKSHOP', 'WHOLESALER', 'RETAILER', 'TRADING', 'SERVICE', 'OTHER']).nullable().optional(),
  sellerDescription: z.string().nullable().optional(),
  interests: z.array(profileInterestCategoryDtoSchema),
  verificationBadges: z.array(z.string()),
  metrics:   z.object({

    }),
  onboardingCompleted: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const publicSellerListDtoSchema = z.object({
  items: z.array(publicSellerSummaryDtoSchema),
});

export const lotPublicResponseDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  sellerId: z.string(),
  categoryId: z.string(),
  subcategoryId: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  quantity: z.number(),
  unit: z.enum(['PIECE', 'SET', 'BOX', 'KG', 'PAIR', 'OTHER']),
  availableQuantity: z.number(),
  minOrderQuantity: z.number(),
  pricingType: z.enum(['FIXED', 'NEGOTIABLE']),
  totalPrice: z.number(),
  unitPrice: z.number(),
  condition: z.enum(['GRADE_A', 'GRADE_B', 'GRADE_C', 'MIXED', 'NEW', 'USED', 'DAMAGED', 'NEAR_EXPIRY']),
  liquidationReason: z.enum(['EXCESS_PRODUCTION', 'CANCELLED_ORDER', 'EXPORT_RETURN', 'SEASON_CLEARANCE', 'OVERSTOCK', 'FACTORY_CLOSURE', 'PACKAGING_CHANGE', 'NEAR_EXPIRY', 'OTHER']),
  province: z.string(),
  city: z.string(),
  locationHint: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'REJECTED', 'EXPIRED', 'SOLD', 'REMOVED']),
  viewCount: z.number(),
  saveCount: z.number(),
  expiresAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable().optional(),
  soldAt: z.iso.datetime().nullable().optional(),
  featuredAt: z.iso.datetime().nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  media: z.array(lotMediaResponseDtoSchema),
});

export const lotCardResponseDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  unitPrice: z.number(),
  totalPrice: z.number(),
  quantity: z.number(),
  availableQuantity: z.number(),
  unit: z.enum(['PIECE', 'SET', 'BOX', 'KG', 'PAIR', 'OTHER']),
  condition: z.enum(['GRADE_A', 'GRADE_B', 'GRADE_C', 'MIXED', 'NEW', 'USED', 'DAMAGED', 'NEAR_EXPIRY']),
  city: z.string(),
  province: z.string(),
  coverThumbUrl: z.string().nullable().optional(),
  seller:   z.object({

    }),
  verifiedSeller: z.boolean(),
  updatedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export const lotOwnerResponseDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  sellerId: z.string(),
  categoryId: z.string(),
  subcategoryId: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  quantity: z.number(),
  unit: z.enum(['PIECE', 'SET', 'BOX', 'KG', 'PAIR', 'OTHER']),
  availableQuantity: z.number(),
  minOrderQuantity: z.number(),
  pricingType: z.enum(['FIXED', 'NEGOTIABLE']),
  totalPrice: z.number(),
  unitPrice: z.number(),
  condition: z.enum(['GRADE_A', 'GRADE_B', 'GRADE_C', 'MIXED', 'NEW', 'USED', 'DAMAGED', 'NEAR_EXPIRY']),
  liquidationReason: z.enum(['EXCESS_PRODUCTION', 'CANCELLED_ORDER', 'EXPORT_RETURN', 'SEASON_CLEARANCE', 'OVERSTOCK', 'FACTORY_CLOSURE', 'PACKAGING_CHANGE', 'NEAR_EXPIRY', 'OTHER']),
  province: z.string(),
  city: z.string(),
  locationHint: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'REJECTED', 'EXPIRED', 'SOLD', 'REMOVED']),
  viewCount: z.number(),
  saveCount: z.number(),
  expiresAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable().optional(),
  soldAt: z.iso.datetime().nullable().optional(),
  featuredAt: z.iso.datetime().nullable().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  media: z.array(lotMediaResponseDtoSchema),
  exactAddress: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
});

export const putLotMediaDtoSchema = z.object({
  items: z.array(putLotMediaItemDtoSchema),
  coverIndex: z.number().optional(),
});

export const mediaUploadResponseDtoSchema = z.object({
  id: z.string(),
  urls: mediaUploadUrlsDtoSchema,
  width: z.number(),
  height: z.number(),
});

export const mediaVideoUploadResponseDtoSchema = z.object({
  id: z.string(),
  urls: mediaVideoUploadUrlsDtoSchema,
  durationMs: z.number(),
});

export const publicSellerProfileDtoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  businessName: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  verified: z.boolean(),
  badges: z.array(z.string()),
  metrics:   z.object({

    }),
  memberSince: z.iso.datetime(),
  categories: z.array(sellerPublicCategoryDtoSchema),
  activeLots:   z.object({
      items: z.array(lotCardResponseDtoSchema),
      total: z.number().int(),
      page: z.number().int(),
      limit: z.number().int(),
    }).optional(),
  soldLots:   z.object({
      items: z.array(lotCardResponseDtoSchema),
      total: z.number().int(),
      page: z.number().int(),
      limit: z.number().int(),
    }).optional(),
});

export const lotPublicDetailResponseDtoSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  description: z.string(),
  totalPrice: z.number(),
  unitPrice: z.number(),
  quantity: z.number(),
  availableQuantity: z.number(),
  minOrderQuantity: z.number(),
  unit: z.enum(['PIECE', 'SET', 'BOX', 'KG', 'PAIR', 'OTHER']),
  condition: z.enum(['GRADE_A', 'GRADE_B', 'GRADE_C', 'MIXED', 'NEW', 'USED', 'DAMAGED', 'NEAR_EXPIRY']),
  liquidationReason: z.enum(['EXCESS_PRODUCTION', 'CANCELLED_ORDER', 'EXPORT_RETURN', 'SEASON_CLEARANCE', 'OVERSTOCK', 'FACTORY_CLOSURE', 'PACKAGING_CHANGE', 'NEAR_EXPIRY', 'OTHER']),
  pricingType: z.enum(['FIXED', 'NEGOTIABLE']),
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'REJECTED', 'EXPIRED', 'SOLD', 'REMOVED']),
  category:   z.object({

    }),
  subcategory:   z.object({

    }).nullable().optional(),
  province: z.string(),
  city: z.string(),
  locationHint: z.string().nullable().optional(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  seller:   z.object({

    }),
  media: z.array(lotMediaResponseDtoSchema),
  similar: z.array(lotCardResponseDtoSchema),
});

export const apiSchemas = {
  Object: objectSchema,
  UserResponseDto: userResponseDtoSchema,
  CreateUserDto: createUserDtoSchema,
  UpdateUserDto: updateUserDtoSchema,
  OtpRequestDto: otpRequestDtoSchema,
  OtpRequestResponseDto: otpRequestResponseDtoSchema,
  OtpVerifyDto: otpVerifyDtoSchema,
  OtpVerifyResponseDto: otpVerifyResponseDtoSchema,
  LoginDto: loginDtoSchema,
  LoginResponseDto: loginResponseDtoSchema,
  MeResponseDto: meResponseDtoSchema,
  CategoryTreeNodeDto: categoryTreeNodeDtoSchema,
  CreateCategoryDto: createCategoryDtoSchema,
  CategoryResponseDto: categoryResponseDtoSchema,
  UpdateCategoryDto: updateCategoryDtoSchema,
  ReorderCategoryDto: reorderCategoryDtoSchema,
  SaveOnboardingDto: saveOnboardingDtoSchema,
  ProfileInterestCategoryDto: profileInterestCategoryDtoSchema,
  ProfileMetricsDto: profileMetricsDtoSchema,
  ProfileResponseDto: profileResponseDtoSchema,
  UpdateProfileDto: updateProfileDtoSchema,
  PublicSellerSummaryDto: publicSellerSummaryDtoSchema,
  PublicSellerListDto: publicSellerListDtoSchema,
  SellerPublicMetricsDto: sellerPublicMetricsDtoSchema,
  SellerPublicCategoryDto: sellerPublicCategoryDtoSchema,
  PublicSellerProfileDto: publicSellerProfileDtoSchema,
  LotMediaResponseDto: lotMediaResponseDtoSchema,
  LotPublicResponseDto: lotPublicResponseDtoSchema,
  LotCardSellerDto: lotCardSellerDtoSchema,
  LotCardResponseDto: lotCardResponseDtoSchema,
  CreateLotDto: createLotDtoSchema,
  LotOwnerResponseDto: lotOwnerResponseDtoSchema,
  LotDetailCategoryDto: lotDetailCategoryDtoSchema,
  LotDetailSellerDto: lotDetailSellerDtoSchema,
  LotPublicDetailResponseDto: lotPublicDetailResponseDtoSchema,
  UpdateLotDto: updateLotDtoSchema,
  PutLotMediaItemDto: putLotMediaItemDtoSchema,
  PutLotMediaDto: putLotMediaDtoSchema,
  MediaUploadUrlsDto: mediaUploadUrlsDtoSchema,
  MediaUploadResponseDto: mediaUploadResponseDtoSchema,
  MediaVideoUploadUrlsDto: mediaVideoUploadUrlsDtoSchema,
  MediaVideoUploadResponseDto: mediaVideoUploadResponseDtoSchema,
} as const;
