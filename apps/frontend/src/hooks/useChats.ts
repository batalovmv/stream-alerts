import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ChatsResponse, ChatResponse } from '../types/chat';

const CHATS_QUERY_KEY = ['chats'] as const;

export function useChats() {
  const queryClient = useQueryClient();

  const chatsQuery = useQuery<ChatsResponse>({
    queryKey: CHATS_QUERY_KEY,
    queryFn: () => api.get<ChatsResponse>('/api/chats'),
  });

  const addChat = useMutation({
    mutationFn: (data: { provider: string; chatId: string }) =>
      api.post<ChatResponse>('/api/chats', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY }),
  });

  const updateChat = useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      enabled?: boolean;
      deleteAfterEnd?: boolean;
      customTemplate?: string | null;
    }) => api.patch<ChatResponse>(`/api/chats/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY }),
  });

  const deleteChat = useMutation({
    mutationFn: (id: string) => api.delete(`/api/chats/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY }),
  });

  const testChat = useMutation({
    mutationFn: (id: string) => api.post(`/api/chats/${id}/test`),
  });

  return {
    chats: chatsQuery.data?.chats ?? [],
    isLoading: chatsQuery.isLoading,
    error: chatsQuery.error,
    addChat,
    updateChat,
    deleteChat,
    testChat,
  };
}
