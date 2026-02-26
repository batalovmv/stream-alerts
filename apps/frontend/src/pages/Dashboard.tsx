import { DashboardLayout } from '../components/layout/DashboardLayout';
import { ChatCard } from '../components/chat/ChatCard';
import { AddChatModal } from '../components/chat/AddChatModal';
import { TelegramStatus } from '../components/chat/TelegramStatus';
import { PlatformsEditor } from '../components/settings/PlatformsEditor';
import { ButtonsEditor } from '../components/settings/ButtonsEditor';
import { CustomBotEditor } from '../components/settings/CustomBotEditor';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Button, Skeleton, EmptyState, Alert, Card, useDisclosure } from '@memelabui/ui';
import { useChats } from '../hooks/useChats';
import { useAuth } from '../hooks/useAuth';
import { useStreamerSettings } from '../hooks/useStreamerSettings';

export function Dashboard() {
  const addModal = useDisclosure();
  const { chats, isLoading, error } = useChats();
  const { user } = useAuth();
  const { settings, updatePlatforms, updateButtons, updateCustomBot } = useStreamerSettings();

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
            <CustomBotEditor
              hasCustomBot={settings.hasCustomBot}
              customBotUsername={settings.customBotUsername}
              onSave={(token) => updateCustomBot.mutate(token)}
              isSaving={updateCustomBot.isPending}
              error={updateCustomBot.error}
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
          onClick={addModal.open}
        >
          + Добавить канал
        </Button>
      </div>

      {/* Chat list */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState />
      ) : chats.length === 0 ? (
        <EmptyStateView
          telegramLinked={user?.telegramLinked ?? false}
          onAdd={addModal.open}
        />
      ) : (
        <div className="space-y-4">
          {chats.map((chat) => (
            <ErrorBoundary
              key={chat.id}
              fallback={(reset) => (
                <ChatCardErrorFallback
                  title={chat.chatTitle || chat.chatId}
                  onRetry={reset}
                />
              )}
            >
              <ChatCard chat={chat} />
            </ErrorBoundary>
          ))}
        </div>
      )}

      <AddChatModal
        open={addModal.isOpen}
        onClose={addModal.close}
      />
    </DashboardLayout>
  );
}

function ErrorState() {
  return (
    <Alert variant="error" title="Не удалось загрузить каналы">
      <p className="mb-4">Произошла ошибка при загрузке данных. Попробуйте обновить страницу.</p>
      <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
        Обновить страницу
      </Button>
    </Alert>
  );
}

function ChatCardErrorFallback({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <Card variant="glass" className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="feature-icon !w-12 !h-12 !rounded-xl !text-xl">
            &#x26A0;&#xFE0F;
          </div>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-white/35">Ошибка отображения карточки</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Повторить
        </Button>
      </div>
    </Card>
  );
}

function EmptyStateView({ telegramLinked, onAdd }: { telegramLinked: boolean; onAdd: () => void }) {
  return (
    <EmptyState
      title="Нет подключённых каналов"
      description={
        telegramLinked
          ? 'Отправьте /connect боту @MemelabNotifyBot в Telegram, чтобы выбрать канал или группу'
          : 'Привяжите Telegram и добавьте канал через бота — никаких ID вводить не нужно'
      }
      actionLabel="+ Добавить канал"
      onAction={onAdd}
    >
      {telegramLinked && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={() => window.open('https://t.me/MemelabNotifyBot', '_blank', 'noopener,noreferrer')}
        >
          Открыть бота
        </Button>
      )}
    </EmptyState>
  );
}
