import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button, Input } from '../ui';
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
    <Modal open={open} onClose={handleClose} title="Подключить канал">
      <div className="space-y-5">
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
      <div className="glass-card p-4 text-sm text-white/50 space-y-3">
        <div className="flex items-start gap-3">
          <div className="step-number shrink-0">1</div>
          <div>
            <p className="font-medium text-white/70">Привяжите Telegram</p>
            <p className="mt-1">
              Нажмите кнопку ниже — откроется бот в Telegram. Это нужно сделать один раз.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="step-number shrink-0">2</div>
          <div>
            <p className="font-medium text-white/70">Добавьте канал через бота</p>
            <p className="mt-1">
              Напишите <span className="text-accent-light">/connect</span> боту — он покажет нативный список ваших каналов и групп. Выбирайте нужный — бот добавится автоматически.
            </p>
          </div>
        </div>
      </div>

      {deepLink ? (
        <a
          href={deepLink && isSafeDeepLink(deepLink) ? deepLink : '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-glow !px-5 !py-2.5 text-sm w-full text-center block"
        >
          Открыть @MemelabNotifyBot
        </a>
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
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText('/connect').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className="glass-card p-4 text-sm text-white/50 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-green-400 font-medium text-xs">Telegram привязан</span>
        </div>

        <p>
          Откройте <span className="text-accent-light">@MemelabNotifyBot</span> в Telegram и отправьте команду:
        </p>

        <button
          type="button"
          onClick={handleCopy}
          className="w-full glass-card p-3 text-left font-mono text-accent-light hover:bg-white/5 transition-all cursor-pointer group"
        >
          <span className="text-white/30 group-hover:text-white/50">/</span>connect
          <span className="float-right text-xs text-white/30 group-hover:text-white/50">
            {copied ? 'Скопировано!' : 'Копировать'}
          </span>
        </button>

        <p>
          Бот покажет нативный список ваших каналов и групп.
          Выберите нужный — бот добавится туда автоматически с нужными правами.
        </p>
      </div>

      <div className="flex gap-3">
        <a
          href="https://t.me/MemelabNotifyBot"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-glow !px-5 !py-2.5 text-sm flex-1 text-center block"
        >
          Открыть бота
        </a>
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
      <div className="glass-card p-4 text-sm text-white/50 space-y-3">
        <p>
          Добавьте бота <span className="text-accent-light">@MemelabNotifyBot</span> как администратора в MAX-группу, затем введите ID чата:
        </p>
        <Input
          placeholder="ID чата в MAX"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          error={error}
        />
      </div>

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
