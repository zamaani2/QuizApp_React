import { getCsrfToken } from './csrf';
import { ApiError, type ApiErrorPayload } from '../types';

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

export async function apiClient<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});

  // Standard JSON accept
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  // Attach CSRF header for state-modifying requests
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken && !headers.has('X-CSRFToken')) {
      headers.set('X-CSRFToken', csrfToken);
    }
  }

  let body: BodyInit | undefined = undefined;
  if (options.body !== undefined) {
    if (
      typeof options.body === 'string' ||
      options.body instanceof FormData ||
      options.body instanceof Blob ||
      options.body instanceof URLSearchParams
    ) {
      body = options.body as BodyInit;
    } else {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    body,
    credentials: options.credentials || 'same-origin',
  });

  if (!response.ok) {
    let payload: ApiErrorPayload;
    try {
      payload = await response.json();
    } catch {
      payload = {
        code: response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR',
        message: response.statusText || `Request failed with status ${response.status}`,
      };
    }
    throw new ApiError(response.status, payload);
  }

  // Empty 204 or 205
  if (response.status === 204 || response.status === 205) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}
