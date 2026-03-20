import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api, ApiError, API_BASE, addUnauthorizedListener } from '../api/client';
import type { AuthMeResponse, User } from '../types/auth';

const AUTH_QUERY_KEY = ['auth', 'me'] as const;

export function useAuth() {
  const queryClient = useQueryClient();

  // Wire up global 401 handler — invalidate auth cache so ProtectedRoute redirects
  useEffect(() => {
    return addUnauthorizedListener(() => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    });
  }, [queryClient]);

  const { data, isLoading, error } = useQuery<AuthMeResponse>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: () => api.get<AuthMeResponse>('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const isAuthenticated = !!data?.user;
  const user: User | null = data?.user ?? null;

  function login() {
    // Remember where to return after OAuth (readable by memelab.ru PostLogin)
    try {
      const returnUrl = `${window.location.origin}/dashboard`;
      const host = window.location.hostname || '';
      const parts = host.split('.');
      const domainAttr = parts.length > 2 ? `; domain=.${parts.slice(-2).join('.')}` : '';
      document.cookie = `memelab_return_service=${encodeURIComponent(returnUrl)}; path=/; max-age=300; SameSite=Lax${domainAttr}`;
    } catch {
      /* test/SSR safety */
    }
    window.location.href = `${API_BASE}/api/auth/login`;
  }

  async function logout() {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Proceed with local cleanup even if server request fails
    } finally {
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.clear();
      window.location.href = '/';
    }
  }

  return {
    user,
    isLoading,
    isAuthenticated,
    isError: !!error && !(error instanceof ApiError && error.status === 401),
    login,
    logout,
  };
}
