export const API_BASE = import.meta.env.VITE_API_URL || '';

/** Listeners invoked on any 401 response — each auth provider registers via addUnauthorizedListener */
const unauthorizedListeners = new Set<() => void>();

export function addUnauthorizedListener(cb: () => void): () => void {
  unauthorizedListeners.add(cb);
  return () => unauthorizedListeners.delete(cb);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: unknown,
  ) {
    super(ApiError.extractMessage(data, status));
    this.name = 'ApiError';
  }

  private static extractMessage(data: unknown, status: number): string {
    if (data !== null && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      // Standard envelope: { error: { message } }
      if (d.error !== null && typeof d.error === 'object') {
        const err = d.error as Record<string, unknown>;
        if (typeof err.message === 'string') return err.message;
      }
      // Legacy: { error: "string" }
      if (typeof d.error === 'string') return d.error;
    }
    return `API Error ${status}`;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Only set Content-Type for requests with a body
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    // Global 401 handler — trigger re-auth check for expired sessions
    if (res.status === 401 && !path.includes('/api/auth/me')) {
      unauthorizedListeners.forEach((cb) => cb());
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = { error: res.statusText };
    }
    throw new ApiError(res.status, data);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
