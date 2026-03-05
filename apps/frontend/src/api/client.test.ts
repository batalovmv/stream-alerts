import { vi, describe, it, expect, beforeEach } from 'vitest';

import { api, ApiError, addUnauthorizedListener } from './client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('api.get', () => {
  it('sends GET request with credentials', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

    await api.get('/api/test');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('does not set Content-Type for GET requests', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

    await api.get('/api/test');

    const call = mockFetch.mock.calls[0];
    expect(call[1].headers?.['Content-Type']).toBeUndefined();
  });

  it('returns parsed JSON body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: 'hello' }));

    const result = await api.get('/api/test');
    expect(result).toEqual({ data: 'hello' });
  });
});

describe('api.post', () => {
  it('sends POST with JSON body and Content-Type', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: 1 }));

    await api.post('/api/items', { name: 'test' });

    const call = mockFetch.mock.calls[0];
    expect(call[1].method).toBe('POST');
    expect(call[1].body).toBe(JSON.stringify({ name: 'test' }));
    expect(call[1].headers['Content-Type']).toBe('application/json');
  });

  it('sends POST without body when none provided', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

    await api.post('/api/logout');

    const call = mockFetch.mock.calls[0];
    expect(call[1].body).toBeUndefined();
    expect(call[1].headers?.['Content-Type']).toBeUndefined();
  });
});

describe('api.patch', () => {
  it('sends PATCH with JSON body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ updated: true }));

    await api.patch('/api/items/1', { enabled: false });

    const call = mockFetch.mock.calls[0];
    expect(call[1].method).toBe('PATCH');
    expect(call[1].body).toBe(JSON.stringify({ enabled: false }));
  });
});

describe('api.delete', () => {
  it('sends DELETE request', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

    await api.delete('/api/items/1');

    const call = mockFetch.mock.calls[0];
    expect(call[1].method).toBe('DELETE');
  });
});

describe('error handling', () => {
  it('throws ApiError with status and data on non-ok response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Not Found' }, 404));

    try {
      await api.get('/api/missing');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
      expect((err as ApiError).data).toEqual({ error: 'Not Found' });
    }
  });

  it('falls back to statusText when response body is not JSON', async () => {
    const res = new Response('Internal Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
    });
    mockFetch.mockResolvedValue(res);

    try {
      await api.get('/api/broken');
    } catch (err) {
      expect((err as ApiError).data).toEqual({ error: 'Internal Server Error' });
    }
  });

  it('returns undefined for 204 No Content', async () => {
    const res = new Response(null, { status: 204 });
    mockFetch.mockResolvedValue(res);

    const result = await api.delete('/api/items/1');
    expect(result).toBeUndefined();
  });
});

describe('401 unauthorized listener', () => {
  it('invokes all unauthorized listeners on 401', async () => {
    const listener = vi.fn();
    addUnauthorizedListener(listener);

    mockFetch.mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401));

    await expect(api.get('/api/chats')).rejects.toThrow(ApiError);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('does NOT invoke listeners on 401 for /api/auth/me', async () => {
    const listener = vi.fn();
    addUnauthorizedListener(listener);

    mockFetch.mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401));

    await expect(api.get('/api/auth/me')).rejects.toThrow(ApiError);
    expect(listener).not.toHaveBeenCalled();
  });

  it('removes listener when cleanup function is called', async () => {
    const listener = vi.fn();
    const cleanup = addUnauthorizedListener(listener);
    cleanup();

    mockFetch.mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401));

    await expect(api.get('/api/chats')).rejects.toThrow(ApiError);
    expect(listener).not.toHaveBeenCalled();
  });
});
