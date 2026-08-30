import type { NextRequest } from 'next/server';
import { serverApiUrl } from './config';
import { logger } from './logger';

/** Same cookie name the API uses; on the web origin it is scoped to `/`. */
export const REFRESH_COOKIE_NAME = 'refresh_token';

export interface ProxyOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Forward the incoming `Authorization` header (bearer access token). */
  forwardAuth?: boolean;
}

/**
 * Server-to-server proxy hop to the NestJS API. Propagates the request id
 * (cross-app correlation) and forwards exactly the headers each endpoint needs.
 */
export async function proxyToApi(
  request: NextRequest,
  path: string,
  options: ProxyOptions = {},
): Promise<Response> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();

  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-request-id': requestId,
  };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.forwardAuth) {
    const authorization = request.headers.get('authorization');
    if (authorization) {
      headers.authorization = authorization;
    }
  }
  const refresh = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  if (refresh) {
    headers.cookie = `${REFRESH_COOKIE_NAME}=${refresh}`;
  }

  logger.debug({ requestId, path, method: options.method ?? 'GET' }, 'bff proxy');

  return fetch(`${serverApiUrl}/${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });
}

/** Reads the refresh token the API issued (Set-Cookie) so the BFF can re-issue it. */
export function upstreamRefreshToken(upstream: Response): string | undefined {
  const lines =
    typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
  for (const line of lines) {
    const [pair] = line.split(';');
    if (pair?.startsWith(`${REFRESH_COOKIE_NAME}=`)) {
      return pair.slice(REFRESH_COOKIE_NAME.length + 1);
    }
  }
  return undefined;
}

/** Passes an upstream error through with its status and JSON body. */
export async function upstreamError(upstream: Response): Promise<Response> {
  const body = await upstream.json().catch(() => ({ message: 'Upstream request failed' }));
  return new Response(JSON.stringify(body), {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
