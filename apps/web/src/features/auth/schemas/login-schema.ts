import { z } from 'zod';

/**
 * Login form schema — single source for both validation and types
 * (doc/CONVENTIONS.md → Forms). Mirrors the API's LoginDto contract.
 */
export const loginSchema = z.object({
  email: z.email('ایمیل معتبر وارد کنید'),
  password: z.string().min(1, 'گذرواژه الزامی است'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
