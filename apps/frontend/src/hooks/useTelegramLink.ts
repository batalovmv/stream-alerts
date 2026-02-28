import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@memelabui/ui';
import { api } from '../api/client';
import type { TelegramLinkResponse } from '../types/auth';

export function useTelegramLink() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
    onError: (error) => {
      toast({ variant: 'error', title: 'Не удалось привязать Telegram', description: error.message || 'Попробуйте ещё раз' });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: () => api.post('/api/auth/telegram-unlink'),
    onSuccess: () => {
      setDeepLink(null);
      clearTimeout(expiryTimerRef.current);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (error) => {
      toast({ variant: 'error', title: 'Не удалось отвязать Telegram', description: error.message || 'Попробуйте ещё раз' });
    },
  });

  return {
    deepLink,
    isLoading: linkMutation.isPending,
    generate: () => linkMutation.mutate(),
    unlink: (callbacks?: { onSuccess?: () => void; onError?: () => void }) =>
      unlinkMutation.mutate(undefined, callbacks),
    isUnlinking: unlinkMutation.isPending,
  };
}
