import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button, Input } from '../ui';
import { useChats } from '../../hooks/useChats';
import { ApiError } from '../../api/client';

interface AddChatModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddChatModal({ open, onClose }: AddChatModalProps) {
  const [provider] = useState<'telegram' | 'max'>('telegram');
  const [chatId, setChatId] = useState('');
  const [error, setError] = useState('');
  const { addChat } = useChats();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!chatId.trim()) {
      setError('Введите ID канала или группы');
      return;
    }

    addChat.mutate(
      { provider, chatId: chatId.trim() },
      {
        onSuccess: () => {
          setChatId('');
          setError('');
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError) {
            const data = err.data as { error?: string } | undefined;
            setError(data?.error || 'Не удалось подключить канал');
          } else {
            setError('Не удалось подключить канал');
          }
        },
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Подключить канал">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Provider selection */}
        <div>
          <label className="block text-sm text-white/50 mb-2">Мессенджер</label>
          <div className="flex gap-3">
            <button
              type="button"
              className="flex-1 glass-card p-4 text-center cursor-pointer transition-all !border-accent/50 shadow-glow"
            >
              <div className="text-2xl mb-1">{'\u2708\uFE0F'}</div>
              <div className="text-sm font-medium">Telegram</div>
            </button>
            <button
              type="button"
              className="flex-1 glass-card p-4 text-center cursor-not-allowed transition-all opacity-50"
              disabled
            >
              <div className="text-2xl mb-1">{'\uD83D\uDCAC'}</div>
              <div className="text-sm font-medium">MAX</div>
              <div className="text-xs text-white/30">Скоро</div>
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="glass-card p-4 text-sm text-white/50 space-y-2">
          <p className="font-medium text-white/70">Инструкция:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              Добавьте{' '}
              <span className="text-accent-light">@MemelabNotifyBot</span> в
              канал/группу
            </li>
            <li>Назначьте бота администратором</li>
            <li>
              Введите ID канала ниже (например:{' '}
              <span className="text-white/70">@my_channel</span> или{' '}
              <span className="text-white/70">-1001234567890</span>)
            </li>
          </ol>
        </div>

        {/* Chat ID input */}
        <Input
          label="ID канала или группы"
          placeholder="@my_channel или -1001234567890"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          error={error}
        />

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={addChat.isPending}
            className="flex-1"
          >
            Подключить
          </Button>
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  );
}
