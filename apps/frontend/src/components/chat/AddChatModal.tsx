import { Modal, Button, IconButton, Card, CopyField, Alert, Stepper } from '@memelabui/ui';
import { useAuth } from '../../hooks/useAuth';
import { useTelegramLink } from '../../hooks/useTelegramLink';
import { isSafeDeepLink } from '../../lib/safeLink';

interface AddChatModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddChatModal({ open, onClose }: AddChatModalProps) {
  const { user } = useAuth();
  const telegramLinked = user?.telegramLinked ?? false;

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

        {telegramLinked ? (
          <LinkedFlow onClose={handleClose} />
        ) : (
          <LinkAccountFlow />
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

