import { useState, useEffect, useRef } from 'react';
import type { ConnectedChat } from '../../types/chat';
import { useChats } from '../../hooks/useChats';
import { Badge, Button, Toggle } from '../ui';

interface ChatCardProps {
  chat: ConnectedChat;
}

export function ChatCard({ chat }: ChatCardProps) {
  const { updateChat, deleteChat, testChat } = useChats();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [template, setTemplate] = useState(chat.customTemplate ?? '');
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Sync template when chat.customTemplate changes externally (#11)
  useEffect(() => {
    setTemplate(chat.customTemplate ?? '');
  }, [chat.customTemplate]);

  // Ref for test status reset timer to prevent leaks (#39)
  const testTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cleanup timer on unmount (#39)
  useEffect(() => {
    return () => clearTimeout(testTimerRef.current);
  }, []);

  const providerLabel = chat.provider === 'telegram' ? 'Telegram' : 'MAX';
  const providerEmoji = chat.provider === 'telegram' ? '\u2708\uFE0F' : '\uD83D\uDCAC';

  // Disable all actions while any mutation is in progress to prevent race conditions
  const isBusy = updateChat.isPending || deleteChat.isPending || testChat.isPending;

  function handleToggleEnabled() {
    updateChat.mutate({ id: chat.id, enabled: !chat.enabled });
  }

  function handleToggleDelete() {
    updateChat.mutate({ id: chat.id, deleteAfterEnd: !chat.deleteAfterEnd });
  }

  function handleDelete() {
    deleteChat.mutate(chat.id, {
      onSuccess: () => setConfirmDelete(false),
      onError: () => setConfirmDelete(false),
    });
  }

  function handleTest() {
    setTestStatus('idle');
    testChat.mutate(chat.id, {
      onSuccess: () => {
        setTestStatus('success');
        clearTimeout(testTimerRef.current);
        testTimerRef.current = setTimeout(() => setTestStatus('idle'), 3000);
      },
      onError: () => {
        setTestStatus('error');
        clearTimeout(testTimerRef.current);
        testTimerRef.current = setTimeout(() => setTestStatus('idle'), 3000);
      },
    });
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

        <Toggle checked={chat.enabled} onChange={handleToggleEnabled} disabled={isBusy} />
      </div>

      {/* Settings row */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
        <div className="flex items-center gap-4">
          <Toggle
            checked={chat.deleteAfterEnd}
            onChange={handleToggleDelete}
            label="Удалять после стрима"
            disabled={isBusy}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            loading={testChat.isPending}
            disabled={isBusy}
          >
            {testStatus === 'success' ? 'Отправлено!' : testStatus === 'error' ? 'Ошибка' : 'Тест'}
          </Button>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={handleDelete}
                loading={deleteChat.isPending}
                disabled={isBusy}
              >
                Удалить
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={isBusy}
              >
                Отмена
              </Button>
            </div>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              disabled={isBusy}
            >
              Удалить
            </Button>
          )}
        </div>
      </div>

      {/* Custom template */}
      <div className="mt-4 pt-4 border-t border-white/5">
        <button
          className="text-sm text-white/40 hover:text-white/60 transition-colors"
          onClick={() => setShowTemplate(!showTemplate)}
        >
          {showTemplate ? 'Скрыть шаблон' : 'Свой шаблон'}
        </button>
        {showTemplate && (
          <div className="mt-3 space-y-2">
            <textarea
              className="input w-full h-24 resize-none text-sm"
              placeholder="Свой шаблон анонса. Переменные: {streamer_name}, {stream_title}, {game_name}"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  updateChat.mutate({ id: chat.id, customTemplate: template || null });
                }}
                loading={updateChat.isPending}
              >
                Сохранить
              </Button>
              {template && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTemplate('');
                    updateChat.mutate({ id: chat.id, customTemplate: null });
                  }}
                >
                  Сбросить
                </Button>
              )}
            </div>
          </div>
        )}
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
