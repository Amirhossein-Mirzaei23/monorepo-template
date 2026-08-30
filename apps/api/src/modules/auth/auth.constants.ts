/** httpOnly cookie carrying the refresh token (never exposed to client JS). */
export const REFRESH_COOKIE_NAME = 'refresh_token';

/** Cookie path: only sent for refresh/logout requests. */
export const REFRESH_COOKIE_PATH = '/auth';
