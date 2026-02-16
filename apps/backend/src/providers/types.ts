/**
 * Provider-agnostic messenger interface.
 *
 * Every messenger (Telegram, MAX, Discord, ...) implements this interface.
 * The core logic never knows which messenger it talks to.
 */

export interface AnnouncementData {
  /** Message text (HTML or plain) */
  text: string;
  /** Photo URL for the stream preview */
  photoUrl?: string;
  /** Inline buttons under the message */
  buttons?: Array<{
    label: string;
    url: string;
  }>;
  /** Send silently (no notification sound) */
  silent?: boolean;
}

export interface SendResult {
  /** Provider-specific message ID (for deletion later) */
  messageId: string;
}

export interface ChatInfo {
  title: string;
  type: 'channel' | 'group' | 'supergroup' | 'private';
  memberCount?: number;
}

export interface MessengerProvider {
  /** Provider name: 'telegram' | 'max' | ... */
  readonly name: string;

  /** Send an announcement to a chat/channel */
  sendAnnouncement(chatId: string, data: AnnouncementData): Promise<SendResult>;

  /** Delete a previously sent message */
  deleteMessage(chatId: string, messageId: string): Promise<void>;

  /** Get info about a chat (title, type, member count) */
  getChatInfo(chatId: string): Promise<ChatInfo>;

  /** Check if the bot has admin access to post in the chat */
  validateBotAccess(chatId: string): Promise<boolean>;
}
