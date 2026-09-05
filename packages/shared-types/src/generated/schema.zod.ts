// GENERATED from openapi.json by scripts/generate.mjs — DO NOT EDIT.
// Regenerate with `npm run gen:types` at the repo root.
/* eslint-disable */

import { z } from 'zod';

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

export const otpVerifyResponseDtoSchema = z.object({
  accessToken: z.string(),
  user: userResponseDtoSchema,
  onboardingCompleted: z.boolean(),
});

export const loginDtoSchema = z.object({
  email: z.email(),
  password: z.string(),
});

export const loginResponseDtoSchema = z.object({
  accessToken: z.string(),
  user: userResponseDtoSchema,
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
} as const;
