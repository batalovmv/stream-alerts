import { useState } from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { ChatCard } from '../components/chat/ChatCard';
import { AddChatModal } from '../components/chat/AddChatModal';
import { TelegramStatus } from '../components/chat/TelegramStatus';
import { PlatformsEditor } from '../components/settings/PlatformsEditor';
import { ButtonsEditor } from '../components/settings/ButtonsEditor';
import { Button } from '../components/ui';
import { useChats } from '../hooks/useChats';
import { useAuth } from '../hooks/useAuth';
import { useStreamerSettings } from '../hooks/useStreamerSettings';

export function Dashboard() {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const { chats, isLoading, error } = useChats();
  const { user } = useAuth();
  const { settings, updatePlatforms, updateButtons } = useStreamerSettings();

  return (
    <DashboardLayout>
      {/* Telegram link status */}
      <TelegramStatus />

      {/* Announcement settings */}
      {settings && (
        <>
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-1">Настройки анонса</h2>
            <p className="text-white/40 text-sm">
              Платформы и кнопки — общие для всех каналов
            </p>
          </div>
          <div className="space-y-4 mb-10">
            <PlatformsEditor
              platforms={settings.streamPlatforms}
              onSave={(platforms) => updatePlatforms.mutate(platforms)}
              isSaving={updatePlatforms.isPending}
            />
            <ButtonsEditor
              buttons={settings.customButtons}
              onSave={(buttons) => updateButtons.mutate(buttons)}
              isSaving={updateButtons.isPending}
            />
          </div>
        </>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Подключённые каналы</h1>
          <p className="text-white/40 text-sm mt-1">
            Управляйте каналами для автоматических анонсов
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => setAddModalOpen(true)}
        >
          + Добавить канал
        </Button>
      </div>

      {/* Chat list */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card p-6 animate-pulse h-24" />
          ))}
        </div>
      ) : error ? (
        <ErrorState />
      ) : chats.length === 0 ? (
        <EmptyState
          telegramLinked={user?.telegramLinked ?? false}
          onAdd={() => setAddModalOpen(true)}
        />
      ) : (
        <div className="space-y-4">
          {chats.map((chat) => (
            <ChatCard key={chat.id} chat={chat} />
          ))}
        </div>
      )}

      <AddChatModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
      />
    </DashboardLayout>
  );
}

function ErrorState() {
  return (
    <div className="glass-card p-12 text-center">
      <div className="feature-icon mx-auto mb-5">&#x26A0;&#xFE0F;</div>
      <h2 className="text-xl font-semibold mb-2">Не удалось загрузить каналы</h2>
      <p className="text-white/40 mb-6 max-w-sm mx-auto">
        Произошла ошибка при загрузке данных. Попробуйте обновить страницу.
      </p>
      <Button variant="primary" onClick={() => window.location.reload()}>
        Обновить страницу
      </Button>
    </div>
  );
}

function EmptyState({ telegramLinked, onAdd }: { telegramLinked: boolean; onAdd: () => void }) {
  return (
    <div className="glass-card p-12 text-center">
      <div className="feature-icon mx-auto mb-5">{'\uD83D\uDCE1'}</div>
      <h2 className="text-xl font-semibold mb-2">Нет подключённых каналов</h2>
      <p className="text-white/40 mb-6 max-w-sm mx-auto">
        {telegramLinked
          ? 'Отправьте /connect боту @MemelabNotifyBot в Telegram, чтобы выбрать канал или группу'
          : 'Привяжите Telegram и добавьте канал через бота — никаких ID вводить не нужно'}
      </p>
      <div className="flex justify-center gap-3">
        <Button variant="primary" onClick={onAdd}>
          + Добавить канал
        </Button>
        {telegramLinked && (
          <a
            href="https://t.me/MemelabNotifyBot"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary !px-5 !py-2.5 text-sm"
          >
            Открыть бота
          </a>
        )}
      </div>
    </div>
  );
}
