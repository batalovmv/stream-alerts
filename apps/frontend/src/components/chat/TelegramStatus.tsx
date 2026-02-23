import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useTelegramLink } from '../../hooks/useTelegramLink';
import { isSafeDeepLink } from '../../lib/safeLink';
import { Button, Alert, ConfirmDialog } from '@memelabui/ui';

export function TelegramStatus() {
  const { user } = useAuth();
  const { deepLink, isLoading, generate, unlink, isUnlinking } = useTelegramLink();
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  if (!user) return null;

  if (user.telegramLinked) {
    return (
      <div className="mb-6">
        <Alert variant="success">
          <div className="flex items-center justify-between w-full">
            <span className="text-sm">
              Telegram привязан — управляйте каналами через{' '}
              <a
                href="https://t.me/MemelabNotifyBot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-light hover:underline"
              >
                @MemelabNotifyBot
              </a>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmUnlink(true)}
            >
              Отвязать
            </Button>
          </div>
        </Alert>

        <ConfirmDialog
          isOpen={confirmUnlink}
          onClose={() => setConfirmUnlink(false)}
          onConfirm={() => {
            unlink({
              onSuccess: () => setConfirmUnlink(false),
              onError: () => setConfirmUnlink(false),
            });
          }}
          title="Отвязать Telegram"
          message="Вы уверены? Управление каналами через бота станет недоступным."
          confirmText="Отвязать"
          cancelText="Отмена"
          variant="danger"
          isLoading={isUnlinking}
        />
      </div>
    );
  }

  return (
    <div className="mb-6">
      <Alert variant="warning">
        <div className="flex items-center justify-between w-full">
          <span className="text-sm">
            Привяжите Telegram, чтобы управлять каналами через бота
          </span>
          {deepLink ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (deepLink && isSafeDeepLink(deepLink)) {
                  window.open(deepLink, '_blank', 'noopener,noreferrer');
                }
              }}
            >
              Открыть бота
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={generate}
              loading={isLoading}
            >
              Привязать
            </Button>
          )}
        </div>
      </Alert>
    </div>
  );
}
