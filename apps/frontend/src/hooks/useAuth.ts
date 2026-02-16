import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import type { AuthMeResponse, User } from '../types/auth';

const AUTH_QUERY_KEY = ['auth', 'me'] as const;
const API_BASE = import.meta.env.VITE_API_URL || '';

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
    await api.post('/api/auth/logout');
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
    queryClient.invalidateQueries();
    window.location.href = '/';
  }

  return {
    user,
    isLoading,
    isAuthenticated,
    isError: error instanceof ApiError && error.status !== 401,
    login,
    logout,
  };
}
