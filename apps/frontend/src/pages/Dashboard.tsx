import { useState } from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { ChatCard } from '../components/chat/ChatCard';
import { AddChatModal } from '../components/chat/AddChatModal';
import { TelegramStatus } from '../components/chat/TelegramStatus';
import { Button } from '../components/ui';
import { useChats } from '../hooks/useChats';
import { useAuth } from '../hooks/useAuth';

export function Dashboard() {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const { chats, isLoading, error } = useChats();
  const { user } = useAuth();

  return (
    <DashboardLayout>
      {/* Telegram link status */}
      <TelegramStatus />

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
