import { DashboardLayout } from '../components/layout/DashboardLayout';
import { PlatformsDisplay } from '../components/settings/PlatformsDisplay';
import { ButtonsEditor } from '../components/settings/ButtonsEditor';
import { CustomBotEditor } from '../components/settings/CustomBotEditor';
import { PhotoTypeSelector } from '../components/settings/PhotoTypeSelector';
import { Skeleton } from '@memelabui/ui';
import { useStreamerSettings } from '../hooks/useStreamerSettings';

export function SettingsPage() {
  const { settings, updateButtons, updateCustomBot, updatePhotoType } = useStreamerSettings();

  if (!settings) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Настройки анонса</h1>
        <p className="text-white/40 text-sm mt-1">
          Платформы и кнопки — общие для всех каналов
        </p>
      </div>
      <div className="space-y-4">
        <PlatformsDisplay platforms={settings.streamPlatforms} />
        <ButtonsEditor
          buttons={settings.customButtons}
          onSave={(buttons) => updateButtons.mutate(buttons)}
          isSaving={updateButtons.isPending}
        />
        <PhotoTypeSelector
          value={settings.photoType}
          onSave={(photoType) => updatePhotoType.mutate(photoType)}
          isSaving={updatePhotoType.isPending}
        />
        <CustomBotEditor
          hasCustomBot={settings.hasCustomBot}
          customBotUsername={settings.customBotUsername}
          onSave={(token) => updateCustomBot.mutate(token)}
          isSaving={updateCustomBot.isPending}
          error={updateCustomBot.error}
        />
      </div>
    </DashboardLayout>
  );
}
