export interface ConnectedChat {
  id: string;
  provider: 'telegram' | 'max';
  chatId: string;
  chatTitle: string | null;
  chatType: string | null;
  enabled: boolean;
  deleteAfterEnd: boolean;
  customTemplate: string | null;
  lastMessageId: string | null;
  lastAnnouncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatsResponse {
  chats: ConnectedChat[];
}

export interface ChatResponse {
  chat: ConnectedChat;
}
