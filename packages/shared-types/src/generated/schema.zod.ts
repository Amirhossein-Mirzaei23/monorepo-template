// GENERATED from openapi.json by scripts/generate.mjs — DO NOT EDIT.
// Regenerate with `npm run gen:types` at the repo root.
 

import { z } from 'zod';

export const objectSchema = z.object({

});

export const userResponseDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['USER', 'ADMIN']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createUserDtoSchema = z.object({
  email: z.email(),
  name: z.string(),
  password: z.string(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export const updateUserDtoSchema = z.object({
  email: z.email().optional(),
  name: z.string().optional(),
  password: z.string().optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

export const registerDtoSchema = z.object({
  email: z.email(),
  name: z.string(),
  password: z.string(),
});

export const loginResponseDtoSchema = z.object({
  accessToken: z.string(),
  user: userResponseDtoSchema,
});

export const loginDtoSchema = z.object({
  email: z.email(),
  password: z.string(),
});

export const apiSchemas = {
  Object: objectSchema,
  UserResponseDto: userResponseDtoSchema,
  CreateUserDto: createUserDtoSchema,
  UpdateUserDto: updateUserDtoSchema,
  RegisterDto: registerDtoSchema,
  LoginResponseDto: loginResponseDtoSchema,
  LoginDto: loginDtoSchema,
} as const;
