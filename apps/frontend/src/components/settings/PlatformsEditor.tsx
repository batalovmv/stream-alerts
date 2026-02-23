import { useState } from 'react';
import { Button, IconButton, Input, Badge, Select, SectionCard, Divider } from '@memelabui/ui';
import type { StreamPlatform } from '../../types/streamer';

interface PlatformsEditorProps {
  platforms: StreamPlatform[];
  onSave: (platforms: StreamPlatform[]) => void;
  isSaving: boolean;
}

const PLATFORM_OPTIONS = [
  { value: 'twitch' as const, label: 'Twitch', icon: '🟣', urlPrefix: 'https://twitch.tv/' },
  { value: 'youtube' as const, label: 'YouTube', icon: '🔴', urlPrefix: 'https://youtube.com/@' },
  { value: 'vk' as const, label: 'VK', icon: '🔵', urlPrefix: 'https://vk.com/video/@' },
  { value: 'kick' as const, label: 'Kick', icon: '🟢', urlPrefix: 'https://kick.com/' },
  { value: 'other' as const, label: 'Другая', icon: '🔗', urlPrefix: '' },
];

function getPlatformInfo(platform: string) {
  return PLATFORM_OPTIONS.find((p) => p.value === platform) ?? PLATFORM_OPTIONS[4];
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function PlatformsEditor({ platforms, onSave, isSaving }: PlatformsEditorProps) {
  const [items, setItems] = useState<StreamPlatform[]>(platforms);
  const [showAdd, setShowAdd] = useState(false);
  const [newPlatform, setNewPlatform] = useState<StreamPlatform['platform']>('twitch');
  const [newLogin, setNewLogin] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  const isDirty = JSON.stringify(items) !== JSON.stringify(platforms);

  function handleAdd() {
    if (!newLogin.trim()) return;

    const info = getPlatformInfo(newPlatform);
    const trimmedLogin = newLogin.trim();
    let url = '';

    if (newPlatform === 'other') {
      const trimmedUrl = newUrl.trim();
      if (!trimmedUrl) return;
      if (!isHttpUrl(trimmedUrl)) {
        setUrlError('Укажите корректный URL с протоколом http:// или https://');
        return;
      }
      setUrlError('');
      url = trimmedUrl;
    } else {
      url = `${info.urlPrefix}${trimmedLogin}`;
    }

    if (!url) return;

    setItems([...items, {
      platform: newPlatform,
      login: trimmedLogin,
      url,
      isManual: true,
    }]);

    setNewLogin('');
    setNewUrl('');
    setUrlError('');
    setShowAdd(false);
  }

  function handleRemove(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function handleSave() {
    onSave(items);
  }

  return (
    <SectionCard
      title="📡 Стриминговые платформы"
      description="Ваши каналы на Twitch, YouTube, VK и других платформах"
    >

      {/* Platform list */}
      {items.length > 0 && (
        <div className="space-y-2 mb-4">
          {items.map((p, i) => {
            const info = getPlatformInfo(p.platform);
            const safeHref = isHttpUrl(p.url) ? p.url : undefined;
            return (
              <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{info.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{info.label}</span>
                      {!p.isManual && (
                        <Badge variant="accent">OAuth</Badge>
                      )}
                    </div>
                    <a
                      href={safeHref}
                      target={safeHref ? '_blank' : undefined}
                      rel={safeHref ? 'noopener noreferrer' : undefined}
                      className="text-xs text-white/40 hover:text-white/60 transition-colors"
                    >
                      {p.url}
                    </a>
                  </div>
                </div>
                <IconButton
                  icon={<span>✕</span>}
                  aria-label="Удалить"
                  onClick={() => handleRemove(i)}
                  variant="ghost"
                  size="sm"
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Add form */}
      {showAdd ? (
        <div className="bg-white/5 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex gap-2">
            <Select
              value={newPlatform}
              onChange={(e) => {
                setNewPlatform(e.target.value as StreamPlatform['platform']);
                setNewUrl('');
                setUrlError('');
              }}
              className="!w-auto"
            >
              {PLATFORM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.icon} {opt.label}
                </option>
              ))}
            </Select>
            <Input
              placeholder={newPlatform === 'other' ? 'Название' : 'Логин / ID канала'}
              value={newLogin}
              onChange={(e) => {
                setNewLogin(e.target.value);
                setUrlError('');
              }}
              className="flex-1"
            />
          </div>
          {newPlatform === 'other' && (
            <>
              <Input
                placeholder="Полная ссылка (https://...)"
                value={newUrl}
                onChange={(e) => {
                  setNewUrl(e.target.value);
                  setUrlError('');
                }}
              />
              {urlError && (
                <p className="text-xs text-red-400">
                  {urlError}
                </p>
              )}
            </>
          )}
          {newPlatform !== 'other' && newLogin && (
            <p className="text-xs text-white/30">
              Ссылка: {getPlatformInfo(newPlatform).urlPrefix}{newLogin}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleAdd}>
              Добавить
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdd(true)}
          className="mb-4"
        >
          + Добавить платформу
        </Button>
      )}

      {/* Save */}
      {isDirty && (
        <>
          <Divider className="my-3" />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSave}
              loading={isSaving}
            >
              Сохранить
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setItems(platforms)}
            >
              Отменить
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}
