import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, API_BASE } from '../api/client';
import type { AuthMeResponse, User } from '../types/auth';

const AUTH_QUERY_KEY = ['auth', 'me'] as const;

export function useAuth() {
  const queryClient = useQueryClient();

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
