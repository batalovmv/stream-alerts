import { useState } from 'react';
import { Badge, SectionCard, Button, IconButton, useToast } from '@memelabui/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { StreamPlatform, AvailablePlatformsResponse, SyncResponse } from '../../types/streamer';
import { buildPlatformUrl } from '../../lib/platformUtils';

const PLATFORM_META: Record<string, { label: string; icon: string }> = {
  twitch: { label: 'Twitch', icon: '🟣' },
  youtube: { label: 'YouTube', icon: '🔴' },
  vk: { label: 'VK', icon: '🔵' },
  kick: { label: 'Kick', icon: '🟢' },
  trovo: { label: 'Trovo', icon: '🟠' },
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
  onUpdate: (platforms: StreamPlatform[]) => void;
  isUpdating?: boolean;
}

export function PlatformsDisplay({ platforms, onUpdate, isUpdating }: PlatformsDisplayProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showPicker, setShowPicker] = useState(false);

  // Fetch available accounts from memelab.ru profile
  const availableQuery = useQuery<AvailablePlatformsResponse>({
    queryKey: ['auth', 'available-platforms'],
    queryFn: () => api.get<AvailablePlatformsResponse>('/api/auth/available-platforms'),
    enabled: showPicker,
    staleTime: 60_000,
  });

  const sync = useMutation({
    mutationFn: () => api.post<SyncResponse>('/api/auth/sync'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['streamer', 'settings'] });
      queryClient.setQueryData(['auth', 'available-platforms'], {
        availableAccounts: data.availableAccounts,
      });
      toast({ variant: 'success', title: 'Данные обновлены' });
    },
    onError: () => {
      toast({ variant: 'error', title: 'Не удалось обновить данные' });
    },
  });

  function handleRemove(index: number) {
    const updated = platforms.filter((_, i) => i !== index);
    onUpdate(updated);
  }

  function handleAdd(account: { platform: StreamPlatform['platform']; login: string }) {
    const url = buildPlatformUrl(account.platform, account.login);
    const newPlatform: StreamPlatform = {
      platform: account.platform,
      login: account.login,
      url,
      isManual: false,
    };
    onUpdate([...platforms, newPlatform]);
    setShowPicker(false);
  }

  // Filter out accounts that are already added
  const addedKeys = new Set(platforms.map((p) => `${p.platform}:${p.login}`));
  const availableToAdd = (availableQuery.data?.availableAccounts ?? []).filter(
    (acc) => !addedKeys.has(`${acc.platform}:${acc.login}`),
  );

  return (
    <SectionCard
      title="Стриминговые платформы"
      description="Платформы из вашего аккаунта MemeLab"
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
      {platforms.length === 0 && !showPicker ? (
        <div className="text-sm text-white/40 space-y-3">
          <p>
            Нет платформ. Привяжите аккаунты в{' '}
            <a
              href="https://memelab.ru/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              MemeLab
            </a>{' '}
            и добавьте их здесь.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setShowPicker(true); }}
          >
            + Добавить платформу
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {platforms.map((p, i) => {
            const meta = PLATFORM_META[p.platform] ?? PLATFORM_META.other;
            const safeHref = isHttpUrl(p.url) ? p.url : undefined;
            return (
              <div key={`${p.platform}:${p.login}`} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
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
                <IconButton
                  icon={<span className="text-sm">✕</span>}
                  aria-label={`Удалить ${meta.label}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(i)}
                  disabled={isUpdating}
                />
              </div>
            );
          })}

          {/* Add platform button / picker */}
          {!showPicker ? (
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 rounded-xl px-4 py-3 text-sm text-white/50 hover:text-white/70 transition-colors"
              onClick={() => setShowPicker(true)}
            >
              <span>+</span> Добавить платформу
            </button>
          ) : (
            <div className="bg-white/5 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-white/50 font-medium">Доступные аккаунты</span>
                <IconButton
                  icon={<span className="text-xs">✕</span>}
                  aria-label="Закрыть"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPicker(false)}
                />
              </div>

              {availableQuery.isLoading ? (
                <p className="text-xs text-white/40 py-2">Загрузка...</p>
              ) : availableQuery.isError ? (
                <p className="text-xs text-red-400 py-2">Не удалось загрузить аккаунты. Попробуйте обновить страницу.</p>
              ) : availableToAdd.length === 0 ? (
                <p className="text-xs text-white/40 py-2">
                  Все привязанные аккаунты уже добавлены.{' '}
                  <a
                    href="https://memelab.ru/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Привязать ещё
                  </a>
                </p>
              ) : (
                availableToAdd.map((acc) => {
                  const meta = PLATFORM_META[acc.platform] ?? PLATFORM_META.other;
                  return (
                    <button
                      key={`${acc.platform}:${acc.login}`}
                      type="button"
                      className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2.5 transition-colors text-left"
                      onClick={() => handleAdd(acc)}
                      disabled={isUpdating}
                    >
                      <span className="text-lg">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm block">{meta.label}</span>
                        <span className="text-xs text-white/40 truncate block">{acc.login}</span>
                      </div>
                      <span className="text-xs text-accent">Добавить</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
