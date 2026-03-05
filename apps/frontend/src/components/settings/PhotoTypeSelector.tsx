import { SectionCard } from '@memelabui/ui';

import type { PhotoType } from '../../types/streamer';

interface PhotoTypeSelectorProps {
  value: PhotoType;
  onSave: (photoType: PhotoType) => void;
  isSaving: boolean;
}

const PHOTO_TYPE_OPTIONS: Array<{
  value: PhotoType;
  label: string;
  description: string;
  disabled?: boolean;
}> = [
  { value: 'stream_preview', label: 'Скриншот стрима', description: 'Превью стрима с платформы' },
  {
    value: 'game_box_art',
    label: 'Обложка игры',
    description: 'Временно недоступно',
    disabled: true,
  },
  { value: 'none', label: 'Без фото', description: 'Только текст' },
];

export function PhotoTypeSelector({ value, onSave, isSaving }: PhotoTypeSelectorProps) {
  return (
    <SectionCard title="Фото в анонсе" description="Какое изображение прикреплять к сообщению">
      <div className="flex flex-col gap-2">
        {PHOTO_TYPE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors ${
              option.disabled
                ? 'opacity-40 cursor-not-allowed'
                : `cursor-pointer ${
                    value === option.value
                      ? 'bg-white/10 ring-1 ring-white/20'
                      : 'bg-white/5 hover:bg-white/[0.07]'
                  }`
            } ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <input
              type="radio"
              name="photoType"
              value={option.value}
              checked={value === option.value}
              onChange={() => onSave(option.value)}
              disabled={isSaving || option.disabled}
              className="accent-[var(--color-primary,#6366f1)] w-4 h-4"
            />
            <div>
              <div className="font-medium text-sm">{option.label}</div>
              <div className="text-xs text-white/40">{option.description}</div>
            </div>
          </label>
        ))}
      </div>
    </SectionCard>
  );
}
