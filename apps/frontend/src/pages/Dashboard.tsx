import { useState } from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { ChatCard } from '../components/chat/ChatCard';
import { AddChatModal } from '../components/chat/AddChatModal';
import { Button } from '../components/ui';
import { useChats } from '../hooks/useChats';

export function Dashboard() {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const { chats, isLoading } = useChats();

  return (
    <DashboardLayout>
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
      ) : chats.length === 0 ? (
        <EmptyState onAdd={() => setAddModalOpen(true)} />
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="glass-card p-12 text-center">
      <div className="feature-icon mx-auto mb-5">{'\uD83D\uDCE1'}</div>
      <h2 className="text-xl font-semibold mb-2">Нет подключённых каналов</h2>
      <p className="text-white/40 mb-6 max-w-sm mx-auto">
        Добавьте Telegram-канал или MAX-группу, чтобы бот начал отправлять
        анонсы
      </p>
      <Button variant="primary" onClick={onAdd}>
        + Добавить первый канал
      </Button>
    </div>
  );
}
