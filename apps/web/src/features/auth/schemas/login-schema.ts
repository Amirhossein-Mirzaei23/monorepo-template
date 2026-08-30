import { z } from 'zod';

/**
 * Login form schema — single source for both validation and types
 * (doc/CONVENTIONS.md → Forms). Mirrors the API's LoginDto contract.
 */
export const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
