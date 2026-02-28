import { Badge, SectionCard, Button, useToast } from '@memelabui/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { StreamPlatform } from '../../types/streamer';

const PLATFORM_META: Record<string, { label: string; icon: string }> = {
  twitch: { label: 'Twitch', icon: '🟣' },
  youtube: { label: 'YouTube', icon: '🔴' },
  vk: { label: 'VK', icon: '🔵' },
  kick: { label: 'Kick', icon: '🟢' },
  other: { label: 'Другая', icon: '🔗' },
};

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

interface PlatformsDisplayProps {
  platforms: StreamPlatform[];
}

export function PlatformsDisplay({ platforms }: PlatformsDisplayProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const sync = useMutation({
    mutationFn: () => api.post('/api/auth/sync'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streamer', 'settings'] });
      toast({ variant: 'success', title: 'Платформы обновлены' });
    },
    onError: () => {
      toast({ variant: 'error', title: 'Не удалось обновить платформы' });
    },
  });

  return (
    <SectionCard
      title="Стриминговые платформы"
      description="Синхронизированы с вашим аккаунтом MemeLab"
      right={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => sync.mutate()}
          loading={sync.isPending}
          disabled={sync.isPending}
        >
          Обновить
        </Button>
      }
    >
      {platforms.length === 0 ? (
        <p className="text-sm text-white/40">
          Нет платформ. Привяжите аккаунты Twitch, YouTube или VK в настройках{' '}
          <a
            href="https://memelab.ru/settings"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            MemeLab
          </a>
          .
        </p>
      ) : (
        <div className="space-y-2">
          {platforms.map((p, i) => {
            const meta = PLATFORM_META[p.platform] ?? PLATFORM_META.other;
            const safeHref = isHttpUrl(p.url) ? p.url : undefined;
            return (
              <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
                <span className="text-lg">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{meta.label}</span>
                    <Badge variant={p.isManual ? 'neutral' : 'accent'}>
                      {p.isManual ? 'Ручной' : 'OAuth'}
                    </Badge>
                  </div>
                  {safeHref ? (
                    <a
                      href={safeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-white/40 hover:text-white/60 transition-colors truncate block"
                    >
                      {p.url}
                    </a>
                  ) : (
                    <span className="text-xs text-white/40 truncate block">{p.login}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
