import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { StreamerSettingsResponse, StreamPlatform, CustomButton } from '../types/streamer';

const SETTINGS_QUERY_KEY = ['streamer', 'settings'] as const;

export function useStreamerSettings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery<StreamerSettingsResponse>({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => api.get<StreamerSettingsResponse>('/api/streamer/settings'),
  });

  const updatePlatforms = useMutation({
    mutationFn: (streamPlatforms: StreamPlatform[]) =>
      api.patch<StreamerSettingsResponse>('/api/streamer/settings', { streamPlatforms }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
  });

  const updateButtons = useMutation({
    mutationFn: (customButtons: CustomButton[] | null) =>
      api.patch<StreamerSettingsResponse>('/api/streamer/settings', { customButtons }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
  });

  const updateDefaultTemplate = useMutation({
    mutationFn: (defaultTemplate: string | null) =>
      api.patch<StreamerSettingsResponse>('/api/streamer/settings', { defaultTemplate }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
  });

  const updateCustomBot = useMutation({
    mutationFn: (customBotToken: string | null) =>
      api.patch<StreamerSettingsResponse>('/api/streamer/settings', { customBotToken }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
  });

  return {
    settings: settingsQuery.data ?? null,
    isLoading: settingsQuery.isLoading,
    error: settingsQuery.error,
    updatePlatforms,
    updateButtons,
    updateDefaultTemplate,
    updateCustomBot,
  };
}
