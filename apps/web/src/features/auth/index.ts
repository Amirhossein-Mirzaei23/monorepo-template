/**
 * Public API (barrel) of the auth feature — the only import path other modules
 * may use (doc/ARCHITECTURE.md → Frontend rules).
 */
export { LoginForm } from './components/login-form';
export { useLogin } from './hooks/use-login';
export { useMe } from './hooks/use-me';
export { loginSchema } from './schemas/login-schema';
export type { LoginFormData } from './schemas/login-schema';
export type { Session, CurrentUser } from './types';
