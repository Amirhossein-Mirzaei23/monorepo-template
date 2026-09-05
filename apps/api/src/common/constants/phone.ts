/**
 * Iranian mobile numbers are normalized (fa→en digits, +98→0) client-side and
 * stored as-is in the canonical `09xxxxxxxxx` form (plan §3 / AUTH-001).
 */
export const USER_PHONE_REGEX = /^09\d{9}$/;
