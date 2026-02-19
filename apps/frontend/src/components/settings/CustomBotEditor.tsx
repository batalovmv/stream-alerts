import { useState } from 'react';
import { Button, Input, Badge } from '../ui';
import { ApiError } from '../../api/client';

interface CustomBotEditorProps {
  hasCustomBot: boolean;
  customBotUsername: string | null;
  onSave: (token: string | null) => void;
  isSaving: boolean;
  error: Error | null;
}

export function CustomBotEditor({ hasCustomBot, customBotUsername, onSave, isSaving, error }: CustomBotEditorProps) {
  const [showForm, setShowForm] = useState(false);
  const [token, setToken] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const apiErrorMessage = error instanceof ApiError
    ? (error.data as { error?: string })?.error
    : error?.message;

  function handleSubmit() {
    if (!token.trim()) return;
    onSave(token.trim());
    setToken('');
    setShowForm(false);
  }

  function handleRemove() {
    onSave(null);
    setConfirmRemove(false);
  }

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            {'\uD83E\uDD16'} Свой бот для анонсов
          </h3>
          <p className="text-sm text-white/35 mt-0.5">
            Используйте своего Telegram-бота вместо @MemelabNotifyBot
          </p>
        </div>
      </div>

      {hasCustomBot ? (
        <>
          {/* Connected bot info */}
          <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 mb-4">
            <div className="flex items-center gap-3">
              <span className="text-lg">{'\uD83E\uDD16'}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    @{customBotUsername}
                  </span>
                  <Badge variant="green">Подключён</Badge>
                </div>
                <p className="text-xs text-white/30 mt-0.5">
                  Анонсы отправляются от имени этого бота
                </p>
              </div>
            </div>

            {confirmRemove ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleRemove}
                  loading={isSaving}
                >
                  Удалить
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmRemove(false)}
                >
                  Отмена
                </Button>
              </div>
            ) : (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmRemove(true)}
              >
                Отключить
              </Button>
            )}
          </div>
        </>
      ) : showForm ? (
        <div className="bg-white/5 rounded-xl p-4 mb-4 space-y-3">
          <div className="text-xs text-white/40 space-y-1">
            <p>1. Создайте бота через <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-accent/80 hover:text-accent">@BotFather</a></p>
            <p>2. Добавьте бота администратором в каналы/группы</p>
            <p>3. Вставьте токен бота сюда</p>
          </div>

          <Input
            type="password"
            placeholder="123456789:AAH..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
            error={apiErrorMessage}
          />

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSubmit}
              loading={isSaving}
              disabled={!token.trim()}
            >
              Подключить
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setShowForm(false); setToken(''); }}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowForm(true)}
        >
          + Подключить своего бота
        </Button>
      )}

      {apiErrorMessage && hasCustomBot && (
        <p className="text-red-400 text-xs mt-2">{apiErrorMessage}</p>
      )}
    </div>
  );
}
