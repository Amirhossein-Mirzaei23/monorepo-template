import type { ApiErrorBody } from '@monorepo/shared-types';

/** Typed, normalized API failure — features never parse raw responses (doc/CONVENTIONS.md). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | undefined;

  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Bearer access token, when calling endpoints that need one. */
  token?: string;
  /** Extra headers merged into the request. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Thin fetch wrapper for the web BFF (`/api/*`): JSON in/out, uniform ApiError
 * on any failure, request-id propagation when the API provides one.
 */
export async function apiFetch<TResponse>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<TResponse> {
  const { method = 'GET', body, token, headers, signal } = options;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Network request failed');
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }
  return (await response.json()) as TResponse;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | undefined;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = undefined;
  }
  const message = Array.isArray(body?.message) ? body.message.join('; ') : body?.message;
  return new ApiError(response.status, message ?? `Request failed (${response.status})`, body);
}
