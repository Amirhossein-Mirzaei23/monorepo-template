/**
 * Machine-readable OTP error codes carried on the thrown HttpException's
 * response body (`getResponse().code`) so AUTH-003/004 can map them to statuses,
 * `Retry-After` headers and Persian messages without parsing free text.
 */
export const OTP_ERROR_CODES = {
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  LOCKED: 'LOCKED',
} as const;

export type OtpErrorCode = (typeof OTP_ERROR_CODES)[keyof typeof OTP_ERROR_CODES];
