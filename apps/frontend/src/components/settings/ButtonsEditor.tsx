import {
  Button,
  IconButton,
  Input,
  SectionCard,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Divider,
  useDisclosure,
} from '@memelabui/ui';
import { useState, useEffect } from 'react';

import type { CustomButton } from '../../types/streamer';

interface ButtonsEditorProps {
  /** null = default buttons, [] = no buttons, [...] = custom */
  buttons: CustomButton[] | null;
  onSave: (buttons: CustomButton[] | null) => void;
  isSaving: boolean;
}

export function ButtonsEditor({ buttons, onSave, isSaving }: ButtonsEditorProps) {
  const [useCustom, setUseCustom] = useState(buttons !== null);
  const [items, setItems] = useState<CustomButton[]>(buttons ?? []);
  const addForm = useDisclosure();
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [urlError, setUrlError] = useState('');

  // Sync local state when server-refreshed props change
  useEffect(() => {
    setUseCustom(buttons !== null);
    setItems(buttons ?? []);
  }, [buttons]);

  const currentValue = useCustom ? items : null;
  const isDirty = JSON.stringify(currentValue) !== JSON.stringify(buttons);

  function isValidButtonUrl(value: string): boolean {
    // Allow template variables like {twitch_url} — will be resolved at send time
    if (/\{[a-z_]+\}/.test(value)) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function handleAdd() {
    if (!newLabel.trim() || !newUrl.trim()) return;
    if (!isValidButtonUrl(newUrl.trim())) {
      setUrlError('Введите корректный HTTP/HTTPS URL или шаблон вида {twitch_url}');
      return;
    }
    setUrlError('');
    setItems([...items, { label: newLabel.trim(), url: newUrl.trim() }]);
    setNewLabel('');
    setNewUrl('');
    addForm.close();
  }

  function handleRemove(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const next = [...items];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setItems(next);
  }

  function handleMoveDown(index: number) {
    if (index === items.length - 1) return;
    const next = [...items];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setItems(next);
  }

  function handleSave() {
    onSave(currentValue);
  }

  function handleReset() {
    setUseCustom(buttons !== null);
    setItems(buttons ?? []);
  }

  return (
    <SectionCard title="🔘 Кнопки под анонсом" description="Inline-кнопки под постом в Telegram">
      {/* Mode toggle */}
      <Tabs
        value={useCustom ? 'custom' : 'default'}
        onValueChange={(v) => setUseCustom(v === 'custom')}
        variant="pill"
        className="mb-4"
      >
        <TabList>
          <Tab value="default">По умолчанию</Tab>
          <Tab value="custom">Свои кнопки</Tab>
        </TabList>

        <TabPanel value="default">
          <div className="bg-white/5 rounded-xl p-4 mt-4">
            <p className="text-sm text-white/50">Используются стандартные кнопки:</p>
            <div className="flex gap-2 mt-2">
              <span className="bg-white/10 px-3 py-1 rounded-lg text-xs">🔗 Смотреть стрим</span>
              <span className="bg-white/10 px-3 py-1 rounded-lg text-xs">📋 MemeLab</span>
            </div>
          </div>
        </TabPanel>

        <TabPanel value="custom">
          <div className="mt-4">
            {/* Button list */}
            {items.length > 0 && (
              <div className="space-y-2 mb-4">
                {items.map((btn, i) => (
                  <div
                    key={`${btn.label}-${btn.url}-${i}`}
                    className="flex items-center gap-2 bg-white/5 rounded-xl px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{btn.label}</div>
                      <div className="text-xs text-white/30 truncate">{btn.url}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <IconButton
                        icon={<span>▲</span>}
                        aria-label="Вверх"
                        onClick={() => handleMoveUp(i)}
                        disabled={i === 0}
                        variant="ghost"
                        size="sm"
                      />
                      <IconButton
                        icon={<span>▼</span>}
                        aria-label="Вниз"
                        onClick={() => handleMoveDown(i)}
                        disabled={i === items.length - 1}
                        variant="ghost"
                        size="sm"
                      />
                      <IconButton
                        icon={<span>✕</span>}
                        aria-label="Удалить"
                        onClick={() => handleRemove(i)}
                        variant="ghost"
                        size="sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {items.length === 0 && !addForm.isOpen && (
              <p className="text-sm text-white/30 mb-4">
                Нет кнопок. Анонс будет отправлен без кнопок.
              </p>
            )}

            {/* Add form */}
            {addForm.isOpen ? (
              <div className="bg-white/5 rounded-xl p-4 mb-4 space-y-3">
                <Input
                  placeholder="Текст кнопки"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <Input
                  placeholder="URL (можно использовать {twitch_url}, {youtube_url} и т.д.)"
                  value={newUrl}
                  onChange={(e) => {
                    setNewUrl(e.target.value);
                    setUrlError('');
                  }}
                  error={urlError || undefined}
                />
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={handleAdd}>
                    Добавить
                  </Button>
                  <Button variant="ghost" size="sm" onClick={addForm.close}>
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={addForm.open} className="mb-4">
                + Добавить кнопку
              </Button>
            )}
          </div>
        </TabPanel>
      </Tabs>

      {/* Save */}
      {isDirty && (
        <>
          <Divider className="my-3" />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleSave} loading={isSaving}>
              Сохранить
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Отменить
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}
