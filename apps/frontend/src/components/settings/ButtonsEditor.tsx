import { useState } from 'react';
import { Button, Input } from '../ui';
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
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const currentValue = useCustom ? items : null;
  const isDirty = JSON.stringify(currentValue) !== JSON.stringify(buttons);

  function handleAdd() {
    if (!newLabel.trim() || !newUrl.trim()) return;
    setItems([...items, { label: newLabel.trim(), url: newUrl.trim() }]);
    setNewLabel('');
    setNewUrl('');
    setShowAdd(false);
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
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            🔘 Кнопки под анонсом
          </h3>
          <p className="text-sm text-white/35 mt-0.5">
            Inline-кнопки под постом в Telegram/MAX
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-4">
        <button
          className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
            !useCustom
              ? 'bg-white/10 text-white'
              : 'text-white/40 hover:text-white/60'
          }`}
          onClick={() => setUseCustom(false)}
        >
          По умолчанию
        </button>
        <button
          className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
            useCustom
              ? 'bg-white/10 text-white'
              : 'text-white/40 hover:text-white/60'
          }`}
          onClick={() => setUseCustom(true)}
        >
          Свои кнопки
        </button>
      </div>

      {!useCustom ? (
        <div className="bg-white/5 rounded-xl p-4">
          <p className="text-sm text-white/50">
            Используются стандартные кнопки:
          </p>
          <div className="flex gap-2 mt-2">
            <span className="bg-white/10 px-3 py-1 rounded-lg text-xs">🔗 Смотреть стрим</span>
            <span className="bg-white/10 px-3 py-1 rounded-lg text-xs">📋 MemeLab</span>
          </div>
        </div>
      ) : (
        <>
          {/* Button list */}
          {items.length > 0 && (
            <div className="space-y-2 mb-4">
              {items.map((btn, i) => (
                <div key={i} className="flex items-center gap-2 bg-white/5 rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{btn.label}</div>
                    <div className="text-xs text-white/30 truncate">{btn.url}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleMoveUp(i)}
                      disabled={i === 0}
                      className="text-white/30 hover:text-white/60 disabled:opacity-20 transition-colors text-xs px-1"
                      title="Вверх"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleMoveDown(i)}
                      disabled={i === items.length - 1}
                      className="text-white/30 hover:text-white/60 disabled:opacity-20 transition-colors text-xs px-1"
                      title="Вниз"
                    >
                      ▼
                    </button>
                    <button
                      onClick={() => handleRemove(i)}
                      className="text-white/30 hover:text-red-400 transition-colors text-sm ml-1"
                      title="Удалить"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {items.length === 0 && !showAdd && (
            <p className="text-sm text-white/30 mb-4">
              Нет кнопок. Анонс будет отправлен без кнопок.
            </p>
          )}

          {/* Add form */}
          {showAdd ? (
            <div className="bg-white/5 rounded-xl p-4 mb-4 space-y-3">
              <Input
                placeholder="Текст кнопки"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <Input
                placeholder="URL (можно использовать {twitch_url}, {youtube_url} и т.д.)"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
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
              + Добавить кнопку
            </Button>
          )}
        </>
      )}

      {/* Save */}
      {isDirty && (
        <div className="flex gap-2 pt-3 border-t border-white/5">
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
            onClick={handleReset}
          >
            Отменить
          </Button>
        </div>
      )}
    </div>
  );
}
