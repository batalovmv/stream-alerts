import { useState, useEffect } from 'react';
import { Button, Input, Badge, SectionCard, ConfirmDialog, Alert, Stepper } from '@memelabui/ui';
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

  // Auto-close form when custom bot is successfully connected
  useEffect(() => {
    if (hasCustomBot) {
      setShowForm(false);
      setToken('');
    }
  }, [hasCustomBot]);

  function handleSubmit() {
    if (!token.trim()) return;
    onSave(token.trim());
  }

  function handleRemove() {
    onSave(null);
    setConfirmRemove(false);
  }

  return (
    <SectionCard
      title={`${'\uD83E\uDD16'} Свой бот для анонсов`}
      description="Используйте своего Telegram-бота вместо @MemelabNotifyBot"
    >
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
                  <Badge variant="success">Подключён</Badge>
                </div>
                <p className="text-xs text-white/30 mt-0.5">
                  Анонсы отправляются от имени этого бота
                </p>
              </div>
            </div>

            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmRemove(true)}
            >
              Отключить
            </Button>
          </div>

          {apiErrorMessage && (
            <Alert variant="error" className="mt-2">
              {apiErrorMessage}
            </Alert>
          )}

          <ConfirmDialog
            isOpen={confirmRemove}
            onClose={() => setConfirmRemove(false)}
            onConfirm={handleRemove}
            title="Отключить бота"
            message="Анонсы будут отправляться от стандартного @MemelabNotifyBot."
            confirmText="Отключить"
            cancelText="Отмена"
            variant="danger"
            isLoading={isSaving}
          />
        </>
      ) : showForm ? (
        <div className="bg-white/5 rounded-xl p-4 mb-4 space-y-3">
          <Stepper
            steps={[
              { label: 'Создайте бота', description: 'Через @BotFather в Telegram' },
              { label: 'Добавьте в каналы', description: 'Как администратора' },
              { label: 'Вставьте токен', description: 'Сюда' },
            ]}
            activeStep={2}
            className="mb-3"
          />

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
    </SectionCard>
  );
}
