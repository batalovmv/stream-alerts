import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { TelegramLinkResponse } from '../types/auth';

export function useTelegramLink() {
  const queryClient = useQueryClient();
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cleanup expiry timer on unmount
  useEffect(() => {
    return () => clearTimeout(expiryTimerRef.current);
  }, []);

  const linkMutation = useMutation({
    mutationFn: () => api.post<TelegramLinkResponse>('/api/auth/telegram-link'),
    onSuccess: (data) => {
      if (data.linked) {
        // Already linked, invalidate auth to refresh telegramLinked flag
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      } else if (data.deepLink) {
        setDeepLink(data.deepLink);
        // Auto-clear deep link after expiry (default 10 min)
        clearTimeout(expiryTimerRef.current);
        const ttl = (data.expiresIn ?? 600) * 1000;
        expiryTimerRef.current = setTimeout(() => setDeepLink(null), ttl);
      }
    },
    onError: (error) => { console.error('Failed to generate Telegram link:', error); },
  });

  const unlinkMutation = useMutation({
    mutationFn: () => api.post('/api/auth/telegram-unlink'),
    onSuccess: () => {
      setDeepLink(null);
      clearTimeout(expiryTimerRef.current);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (error) => { console.error('Failed to unlink Telegram:', error); },
  });

  return {
    deepLink,
    isLoading: linkMutation.isPending,
    generate: () => linkMutation.mutate(),
    unlink: () => unlinkMutation.mutate(),
    isUnlinking: unlinkMutation.isPending,
  };
}
