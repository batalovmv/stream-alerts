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

export interface StreamerSettings {
  streamPlatforms: StreamPlatform[];
  customButtons: CustomButton[] | null;
  defaultTemplate: string | null;
  templateVariables?: TemplateVariable[];
  customBotUsername: string | null;
  hasCustomBot: boolean;
}

export interface StreamerSettingsResponse extends StreamerSettings {
  templateVariables: TemplateVariable[];
}
