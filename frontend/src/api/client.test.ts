import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from './client';
import { ApiError } from '../types';

describe('apiClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    document.cookie = '';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('attaches credentials and does not include CSRF token on GET', async () => {
    document.cookie = 'csrftoken=test-csrf-token-123';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    global.fetch = mockFetch;

    const data = await apiClient<{ success: boolean }>('/api/test/');
    expect(data).toEqual({ success: true });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/test/');
    expect(options.credentials).toBe('same-origin');
    expect(options.headers.get('X-CSRFToken')).toBeNull();
  });

  it('attaches X-CSRFToken header on POST requests', async () => {
    document.cookie = 'csrftoken=secret-csrf-token';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ created: true }),
    });
    global.fetch = mockFetch;

    const data = await apiClient<{ created: boolean }>('/api/submit/', {
      method: 'POST',
      body: { name: 'test' },
    });
    expect(data).toEqual({ created: true });

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.get('X-CSRFToken')).toBe('secret-csrf-token');
    expect(options.headers.get('Content-Type')).toBe('application/json');
    expect(options.body).toBe(JSON.stringify({ name: 'test' }));
  });

  it('throws ApiError with payload on 401 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ code: 'UNAUTHORIZED', message: 'Authentication required' }),
    });
    global.fetch = mockFetch;

    await expect(apiClient('/api/v1/me/')).rejects.toThrow(ApiError);
    try {
      await apiClient('/api/v1/me/');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(401);
      expect(apiErr.code).toBe('UNAUTHORIZED');
      expect(apiErr.message).toBe('Authentication required');
    }
  });

  it('throws ApiError with payload on 403 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ code: 'FORBIDDEN', message: 'A valid school association is required.' }),
    });
    global.fetch = mockFetch;

    try {
      await apiClient('/api/v1/me/');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.code).toBe('FORBIDDEN');
      expect(apiErr.message).toBe('A valid school association is required.');
    }
  });

  it('uses the standard API error envelope for validation messages', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fields: { contact_number: ['This field is required.'] } }),
    });

    await expect(apiClient('/api/v1/students/', { method: 'POST', body: {} }))
      .rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Please correct the highlighted fields.',
      });
  });
});
