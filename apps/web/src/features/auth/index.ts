/**
 * Public API (barrel) of the auth feature — the only import path other modules
 * may use (doc/ARCHITECTURE.md → Frontend rules).
 */
export { LoginForm } from './components/login-form';
export { useOtpRequest } from './hooks/use-otp-request';
export { useOtpVerify } from './hooks/use-otp-verify';
export { useMe } from './hooks/use-me';
export { authKeys } from './api/keys';
export { otpRequestSchema, otpVerifySchema, toEnglishDigits } from './schemas/otp-schema';
export type { OtpRequestFormData, OtpVerifyFormData } from './schemas/otp-schema';
export type { Session, CurrentUser } from './types';
