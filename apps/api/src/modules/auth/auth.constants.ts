/** httpOnly cookie carrying the refresh token (never exposed to client JS). */
export const REFRESH_COOKIE_NAME = 'refresh_token';

/** Cookie path: only sent for refresh/logout requests. */
export const REFRESH_COOKIE_PATH = '/auth';

/**
 * Machine-readable auth error codes carried on the thrown HttpException's
 * response body (`getResponse().code`) so the web can map statuses to
 * Persian messages without parsing free text (AUTH-003).
 */
export const AUTH_ERROR_CODES = {
  ADMIN_ONLY_LOGIN: 'ADMIN_ONLY_LOGIN',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_BLOCKED: 'ACCOUNT_BLOCKED',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

/**
 * Stricter per-route throttle on `POST /auth/otp/request` (card AUTH-003:
 * 5/min/IP on top of OtpService's per-phone DB caps). Values are static —
 * they feed the `@Throttle` decorator, which is evaluated once at boot.
 */
export const OTP_REQUEST_THROTTLE = {
  limit: 5,
  ttlMs: 60_000,
} as const;
