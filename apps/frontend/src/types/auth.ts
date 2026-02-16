export interface User {
  id: string;
  memelabUserId: string;
  displayName: string;
  avatarUrl: string | null;
  twitchLogin: string | null;
  channelId: string | null;
}

export interface AuthMeResponse {
  user: User;
}
