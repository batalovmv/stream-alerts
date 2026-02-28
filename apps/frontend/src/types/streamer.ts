export interface StreamPlatform {
  platform: 'twitch' | 'youtube' | 'vk' | 'kick' | 'other';
  login: string;
  url: string;
  isManual: boolean;
}

export interface CustomButton {
  label: string;
  url: string;
}

export interface TemplateVariable {
  name: string;
  description: string;
}

export type PhotoType = 'stream_preview' | 'game_box_art' | 'none';

export interface StreamerSettings {
  streamPlatforms: StreamPlatform[];
  customButtons: CustomButton[] | null;
  defaultTemplate: string | null;
  templateVariables?: TemplateVariable[];
  customBotUsername: string | null;
  hasCustomBot: boolean;
  photoType: PhotoType;
}

export interface StreamerSettingsResponse extends StreamerSettings {
  templateVariables: TemplateVariable[];
}

export interface AvailableAccount {
  platform: StreamPlatform['platform'];
  login: string;
  displayName: string;
}

export interface AvailablePlatformsResponse {
  availableAccounts: AvailableAccount[];
}

export interface SyncResponse {
  ok: boolean;
  availableAccounts: AvailableAccount[];
}
