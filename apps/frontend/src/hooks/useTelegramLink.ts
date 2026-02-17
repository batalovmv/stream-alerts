import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { TelegramLinkResponse } from '../types/auth';

export function useTelegramLink() {
  const queryClient = useQueryClient();
  const [deepLink, setDeepLink] = useState<string | null>(null);

  const linkMutation = useMutation({
    mutationFn: () => api.post<TelegramLinkResponse>('/api/auth/telegram-link'),
    onSuccess: (data) => {
      if (data.linked) {
        // Already linked, invalidate auth to refresh telegramLinked flag
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      } else if (data.deepLink) {
        setDeepLink(data.deepLink);
      }
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: () => api.post('/api/auth/telegram-unlink'),
    onSuccess: () => {
      setDeepLink(null);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  return {
    deepLink,
    isLoading: linkMutation.isPending,
    generate: () => linkMutation.mutate(),
    unlink: () => unlinkMutation.mutate(),
    isUnlinking: unlinkMutation.isPending,
  };
}
