import { useState } from 'react';
import { Modal, Button, IconButton, Input, Card, CopyField, Alert, Stepper } from '@memelabui/ui';
import { useAuth } from '../../hooks/useAuth';
import { useChats } from '../../hooks/useChats';
import { useTelegramLink } from '../../hooks/useTelegramLink';
import { isSafeDeepLink } from '../../lib/safeLink';
import { ApiError } from '../../api/client';

interface AddChatModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddChatModal({ open, onClose }: AddChatModalProps) {
  const { user } = useAuth();
  const telegramLinked = user?.telegramLinked ?? false;
  // MAX provider hidden — bot creation on dev.max.ru is currently unavailable.
  // When MAX becomes available, restore provider selection (see MaxFlow below).
  const provider = 'telegram' as const;

  function handleClose() {
    onClose();
  }

  return (
    <Modal isOpen={open} onClose={handleClose} ariaLabel="Подключить канал">
      <div className="space-y-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Подключить канал</h2>
          <IconButton
            icon={<span>&#x2715;</span>}
            aria-label="Закрыть"
            onClick={handleClose}
            variant="ghost"
            size="sm"
          />
        </div>

        {/* Provider selection — MAX hidden until bot creation is available on dev.max.ru
        <div>
          <label className="block text-sm text-white/50 mb-2">Мессенджер</label>
          <div className="flex gap-3">
            <button
              type="button"
              className={`flex-1 glass-card p-4 text-center transition-all ${provider === 'telegram' ? '!border-accent/50 shadow-glow' : 'opacity-60 hover:opacity-80'}`}
              onClick={() => setProvider('telegram')}
            >
              <div className="text-2xl mb-1">{'\u2708\uFE0F'}</div>
              <div className="text-sm font-medium">Telegram</div>
            </button>
            <button
              type="button"
              className={`flex-1 glass-card p-4 text-center transition-all ${provider === 'max' ? '!border-accent/50 shadow-glow' : 'opacity-60 hover:opacity-80'}`}
              onClick={() => setProvider('max')}
            >
              <div className="text-2xl mb-1">{'\uD83D\uDCAC'}</div>
              <div className="text-sm font-medium">MAX</div>
            </button>
          </div>
        </div>
        */}

        {provider === 'telegram' ? (
          telegramLinked ? (
            <LinkedFlow onClose={handleClose} />
          ) : (
            <LinkAccountFlow />
          )
        ) : (
          <MaxFlow onClose={handleClose} />
        )}
      </div>
    </Modal>
  );
}

/** Flow when Telegram is NOT yet linked — show link button */
function LinkAccountFlow() {
  const { deepLink, isLoading, generate } = useTelegramLink();

  return (
    <>
      <Stepper
        steps={[
          { label: 'Привяжите Telegram', description: 'Нажмите кнопку ниже — откроется бот в Telegram. Это нужно сделать один раз.' },
          { label: 'Добавьте канал через бота', description: 'Напишите /connect боту — он покажет нативный список ваших каналов и групп.' },
        ]}
        activeStep={0}
        className="mb-4"
      />

      {deepLink ? (
        <Button
          variant="primary"
          size="md"
          className="w-full"
          onClick={() => {
            if (deepLink && isSafeDeepLink(deepLink)) {
              window.open(deepLink, '_blank', 'noopener,noreferrer');
            }
          }}
        >
          Открыть @MemelabNotifyBot
        </Button>
      ) : (
        <Button
          variant="primary"
          size="md"
          loading={isLoading}
          onClick={generate}
          className="w-full"
        >
          Привязать Telegram
        </Button>
      )}
    </>
  );
}

/** Flow when Telegram IS linked — direct them to the bot */
function LinkedFlow({ onClose }: { onClose: () => void }) {
  return (
    <>
      <Alert variant="success" className="mb-3">
        Telegram привязан
      </Alert>

      <Card variant="glass" className="p-4 text-sm text-white/50 space-y-3">
        <p>
          Откройте <span className="text-accent-light">@MemelabNotifyBot</span> в Telegram и отправьте команду:
        </p>

        <CopyField value="/connect" label="Команда" />

        <p>
          Бот покажет нативный список ваших каналов и групп.
          Выберите нужный — бот добавится туда автоматически с нужными правами.
        </p>
      </Card>

      <div className="flex gap-3">
        <Button
          variant="primary"
          size="md"
          className="flex-1"
          onClick={() => window.open('https://t.me/MemelabNotifyBot', '_blank', 'noopener,noreferrer')}
        >
          Открыть бота
        </Button>
        <Button variant="secondary" size="md" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </>
  );
}

/** Flow for adding a MAX chat — enter chat ID manually */
function MaxFlow({ onClose }: { onClose: () => void }) {
  const [chatId, setChatId] = useState('');
  const { addChat } = useChats();
  const [error, setError] = useState('');

  async function handleAdd() {
    if (!chatId.trim()) {
      setError('Введите ID чата');
      return;
    }
    setError('');
    addChat.mutate(
      { provider: 'max', chatId: chatId.trim() },
      {
        onSuccess: () => onClose(),
        onError: (err) => {
          if (err instanceof ApiError && err.data && typeof err.data === 'object' && 'error' in err.data) {
            setError(String((err.data as { error: string }).error));
          } else {
            setError('Ошибка при добавлении');
          }
        },
      },
    );
  }

  return (
    <>
      <Card variant="glass" className="p-4 text-sm text-white/50 space-y-3">
        <p>
          Добавьте бота <span className="text-accent-light">@MemelabNotifyBot</span> как администратора в MAX-группу, затем введите ID чата:
        </p>
        <Input
          placeholder="ID чата в MAX"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          error={error}
        />
      </Card>

      <div className="flex gap-3">
        <Button
          variant="primary"
          size="md"
          onClick={handleAdd}
          loading={addChat.isPending}
          className="flex-1"
        >
          Подключить
        </Button>
        <Button variant="secondary" size="md" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </>
  );
}
