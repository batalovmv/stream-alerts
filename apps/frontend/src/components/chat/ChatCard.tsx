import { useState } from 'react';
import type { ConnectedChat } from '../../types/chat';
import { useChats } from '../../hooks/useChats';
import { Badge, Button, Toggle } from '../ui';

interface ChatCardProps {
  chat: ConnectedChat;
}

export function ChatCard({ chat }: ChatCardProps) {
  const { updateChat, deleteChat, testChat } = useChats();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const providerLabel = chat.provider === 'telegram' ? 'Telegram' : 'MAX';
  const providerEmoji = chat.provider === 'telegram' ? '\u2708\uFE0F' : '\uD83D\uDCAC';

  function handleToggleEnabled() {
    updateChat.mutate({ id: chat.id, enabled: !chat.enabled });
  }

  function handleToggleDelete() {
    updateChat.mutate({ id: chat.id, deleteAfterEnd: !chat.deleteAfterEnd });
  }

  function handleDelete() {
    deleteChat.mutate(chat.id, {
      onSuccess: () => setConfirmDelete(false),
    });
  }

  function handleTest() {
    testChat.mutate(chat.id);
  }

  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="feature-icon !w-12 !h-12 !rounded-xl !text-xl">
            {providerEmoji}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{chat.chatTitle || chat.chatId}</h3>
              <Badge variant={chat.enabled ? 'green' : 'gray'}>
                {chat.enabled ? 'Активен' : 'Отключён'}
              </Badge>
              <Badge variant="accent">{providerLabel}</Badge>
            </div>
            <p className="text-sm text-white/35 mt-0.5">
              {chat.chatType && `${chat.chatType} \u00B7 `}
              ID: {chat.chatId}
            </p>
          </div>
        </div>

        <Toggle checked={chat.enabled} onChange={handleToggleEnabled} />
      </div>

      {/* Settings row */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
        <div className="flex items-center gap-4">
          <Toggle
            checked={chat.deleteAfterEnd}
            onChange={handleToggleDelete}
            label="Удалять после стрима"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            loading={testChat.isPending}
          >
            Тест
          </Button>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                loading={deleteChat.isPending}
              >
                Удалить
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(false)}
              >
                Отмена
              </Button>
            </div>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmDelete(true)}
            >
              Отключить
            </Button>
          )}
        </div>
      </div>

      {/* Last announced */}
      {chat.lastAnnouncedAt && (
        <p className="text-xs text-white/25 mt-3">
          Последний анонс:{' '}
          {new Date(chat.lastAnnouncedAt).toLocaleString('ru-RU')}
        </p>
      )}
    </div>
  );
}
