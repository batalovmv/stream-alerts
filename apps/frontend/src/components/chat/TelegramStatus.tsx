import { useAuth } from '../../hooks/useAuth';
import { useTelegramLink } from '../../hooks/useTelegramLink';
import { Button } from '../ui';

export function TelegramStatus() {
  const { user } = useAuth();
  const { deepLink, isLoading, generate, unlink, isUnlinking } = useTelegramLink();

  if (!user) return null;

  if (user.telegramLinked) {
    return (
      <div className="glass-card p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-sm text-white/70">
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
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => unlink()}
          loading={isUnlinking}
        >
          Отвязать
        </Button>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 mb-6 flex items-center justify-between border-amber-500/20">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-amber-400" />
        <span className="text-sm text-white/70">
          Привяжите Telegram, чтобы управлять каналами через бота
        </span>
      </div>
      {deepLink ? (
        <a
          href={deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-glow !px-3 !py-1.5 text-sm"
        >
          Открыть бота
        </a>
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
  );
}
