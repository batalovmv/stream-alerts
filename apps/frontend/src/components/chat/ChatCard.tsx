import {
  Badge,
  Button,
  Toggle,
  Card,
  Textarea,
  CollapsibleSection,
  ConfirmDialog,
  Divider,
  useToast,
  useDisclosure,
} from '@memelabui/ui';
import { useState, useEffect } from 'react';

import { useChats } from '../../hooks/useChats';
import { useStreamerSettings } from '../../hooks/useStreamerSettings';
import type { ConnectedChat } from '../../types/chat';
import { TemplateVariablesList } from '../settings/TemplateVariablesList';

interface ChatCardProps {
  chat: ConnectedChat;
}

export function ChatCard({ chat }: ChatCardProps) {
  const { updateChat, deleteChat, testChat } = useChats();
  const { settings } = useStreamerSettings();
  const { toast } = useToast();
  const deleteDialog = useDisclosure();
  const [template, setTemplate] = useState(chat.customTemplate ?? '');

  // Sync template when chat.customTemplate changes externally (#11)
  useEffect(() => {
    setTemplate(chat.customTemplate ?? '');
  }, [chat.customTemplate]);

  const providerLabel = chat.provider === 'telegram' ? 'Telegram' : 'MAX';
  const providerEmoji = chat.provider === 'telegram' ? '\u2708\uFE0F' : '\uD83D\uDCAC';

  // Disable all actions while any mutation is in progress to prevent race conditions
  const isBusy = updateChat.isPending || deleteChat.isPending || testChat.isPending;

  function handleToggleEnabled() {
    updateChat.mutate({ id: chat.id, enabled: !chat.enabled });
  }

  function handleToggleDelete() {
    updateChat.mutate({ id: chat.id, deleteAfterEnd: !chat.deleteAfterEnd });
  }

  function handleDelete() {
    deleteChat.mutate(chat.id, {
      onSuccess: () => deleteDialog.close(),
      onError: () => deleteDialog.close(),
    });
  }

  function handleTest() {
    testChat.mutate(chat.id, {
      onSuccess: () => {
        toast({ variant: 'success', title: 'Тестовый анонс отправлен' });
      },
      onError: () => {
        toast({ variant: 'error', title: 'Не удалось отправить тест' });
      },
    });
  }

  return (
    <Card variant="glass" className="p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="feature-icon !w-12 !h-12 !rounded-xl !text-xl">{providerEmoji}</div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{chat.chatTitle || chat.chatId}</h3>
              <Badge variant={chat.enabled ? 'success' : 'neutral'}>
                {chat.enabled ? 'Активен' : 'Отключён'}
              </Badge>
              <Badge variant="accent">{providerLabel}</Badge>
            </div>
            <p className="text-sm text-white/35 mt-0.5">
              {chat.chatType && `${chat.chatType} \u00B7 `}
              ID: {chat.chatId}
            </p>
          </div>
        </div>

        <Toggle checked={chat.enabled} onChange={handleToggleEnabled} busy={isBusy} />
      </div>

      {/* Settings row */}
      <Divider className="my-4" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Toggle
            checked={chat.deleteAfterEnd}
            onChange={handleToggleDelete}
            label="Удалять после стрима"
            busy={isBusy}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            loading={testChat.isPending}
            disabled={isBusy}
          >
            Тест
          </Button>
          <Button variant="danger" size="sm" onClick={deleteDialog.open} disabled={isBusy}>
            Удалить
          </Button>
        </div>
      </div>

      {/* Custom template */}
      <Divider className="my-4" />
      <CollapsibleSection title="Свой шаблон" defaultOpen={false}>
        <div className="space-y-2">
          <Textarea
            className="h-24 resize-none text-sm"
            placeholder="Свой шаблон анонса. Например: 🔴 {streamer_name} в эфире! {stream_title}"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          />
          {settings?.templateVariables && (
            <TemplateVariablesList variables={settings.templateVariables} />
          )}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isBusy}
              onClick={() => {
                updateChat.mutate({ id: chat.id, customTemplate: template || null });
              }}
              loading={updateChat.isPending}
            >
              Сохранить
            </Button>
            {template && (
              <Button
                variant="ghost"
                size="sm"
                disabled={isBusy}
                onClick={() => {
                  setTemplate('');
                  updateChat.mutate({ id: chat.id, customTemplate: null });
                }}
              >
                Сбросить
              </Button>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* Last announced */}
      {chat.lastAnnouncedAt && (
        <p className="text-xs text-white/25 mt-3">
          Последний анонс: {new Date(chat.lastAnnouncedAt).toLocaleString('ru-RU')}
        </p>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={handleDelete}
        title="Удалить канал"
        message="Вы уверены, что хотите удалить этот канал? Анонсы больше не будут отправляться."
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
        isLoading={deleteChat.isPending}
      />
    </Card>
  );
}
