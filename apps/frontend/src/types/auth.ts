export interface User {
  id: string;
  memelabUserId: string;
  displayName: string;
  avatarUrl: string | null;
  twitchLogin: string | null;
  channelId: string | null;
  telegramLinked: boolean;
}

export interface AuthMeResponse {
  user: User;
}

export interface TelegramLinkResponse {
  linked: boolean;
  deepLink?: string;
  expiresIn?: number;
  message?: string;
}
