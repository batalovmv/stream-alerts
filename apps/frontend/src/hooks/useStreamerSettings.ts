import { useToast } from '@memelabui/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../api/client';
import type {
  StreamerSettingsResponse,
  StreamPlatform,
  CustomButton,
  PhotoType,
} from '../types/streamer';

const SETTINGS_QUERY_KEY = ['streamer', 'settings'] as const;

export function useStreamerSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  function handleUpdateError(error: Error) {
    toast({
      variant: 'error',
      title: 'Не удалось обновить настройки',
      description: error.message || 'Попробуйте ещё раз',
    });
  }

  const settingsQuery = useQuery<StreamerSettingsResponse>({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () =>
      api
        .get<{ settings: StreamerSettingsResponse }>('/api/streamer/settings')
        .then((r) => r.settings),
  });

  const updatePlatforms = useMutation({
    mutationFn: (streamPlatforms: StreamPlatform[]) =>
      api
        .patch<{
          settings: StreamerSettingsResponse;
        }>('/api/streamer/settings', { streamPlatforms })
        .then((r) => r.settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
    onError: handleUpdateError,
  });

  const updateButtons = useMutation({
    mutationFn: (customButtons: CustomButton[] | null) =>
      api
        .patch<{ settings: StreamerSettingsResponse }>('/api/streamer/settings', { customButtons })
        .then((r) => r.settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
    onError: handleUpdateError,
  });

  const updateCustomBot = useMutation({
    mutationFn: (customBotToken: string | null) =>
      api
        .patch<{ settings: StreamerSettingsResponse }>('/api/streamer/settings', { customBotToken })
        .then((r) => r.settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
    onError: handleUpdateError,
  });

  const updatePhotoType = useMutation({
    mutationFn: (photoType: PhotoType) =>
      api
        .patch<{ settings: StreamerSettingsResponse }>('/api/streamer/settings', { photoType })
        .then((r) => r.settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
    onError: handleUpdateError,
  });

  return {
    settings: settingsQuery.data ?? null,
    isLoading: settingsQuery.isLoading,
    error: settingsQuery.error,
    updatePlatforms,
    updateButtons,
    updateCustomBot,
    updatePhotoType,
  };
}
