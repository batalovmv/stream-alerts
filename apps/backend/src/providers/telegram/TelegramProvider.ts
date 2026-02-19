import type { MessengerProvider, AnnouncementData, SendResult, ChatInfo } from '../types.js';
import * as tg from './telegramApi.js';
import { logger } from '../../lib/logger.js';

export class TelegramProvider implements MessengerProvider {
  readonly name = 'telegram';
  private readonly token?: string;

  /**
   * @param token — custom bot token. If omitted, uses the global bot token.
   */
  constructor(token?: string) {
    this.token = token;
  }

  async sendAnnouncement(chatId: string, data: AnnouncementData): Promise<SendResult> {
    if (data.photoUrl) {
      const msg = await tg.sendPhoto({
        chatId,
        photoUrl: data.photoUrl,
        caption: data.text,
        buttons: data.buttons,
        silent: data.silent,
        token: this.token,
      });
      return { messageId: String(msg.message_id) };
    }

    const msg = await tg.sendMessage({
      chatId,
      text: data.text,
      buttons: data.buttons,
      silent: data.silent,
      token: this.token,
    });
    return { messageId: String(msg.message_id) };
  }

  async editAnnouncement(chatId: string, messageId: string, data: AnnouncementData): Promise<void> {
    const numericId = parseInt(messageId, 10);
    if (!Number.isFinite(numericId)) {
      logger.warn({ chatId, messageId }, 'telegram.editAnnouncement: invalid message ID');
      return;
    }

    if (data.photoUrl) {
      await tg.editMessageCaption({
        chatId,
        messageId: numericId,
        caption: data.text,
        buttons: data.buttons,
        token: this.token,
      });
    } else {
      const replyMarkup = data.buttons?.length
        ? { inline_keyboard: [data.buttons.map((b) => ({ text: b.label, url: b.url }))] }
        : { inline_keyboard: [] };
      await tg.editMessageText({
        chatId,
        messageId: numericId,
        text: data.text,
        replyMarkup,
        token: this.token,
      });
    }
  }

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    const numericId = parseInt(messageId, 10);
    if (!Number.isFinite(numericId)) {
      logger.warn({ chatId, messageId }, 'telegram.deleteMessage: invalid message ID');
      return;
    }
    await tg.deleteMessageApi(chatId, numericId, this.token);
  }

  async getChatInfo(chatId: string): Promise<ChatInfo> {
    const chat = await tg.getChat(chatId, this.token);
    let memberCount: number | undefined;
    try {
      memberCount = await tg.getChatMemberCount(chatId, this.token);
    } catch {
      // member count may not be available for all chat types
    }

    const VALID_CHAT_TYPES = new Set<string>(['channel', 'group', 'supergroup', 'private']);
    return {
      title: chat.title ?? 'Private Chat',
      type: VALID_CHAT_TYPES.has(chat.type) ? (chat.type as ChatInfo['type']) : 'group',
      memberCount,
    };
  }

  async validateBotAccess(chatId: string): Promise<boolean> {
    try {
      const member = await tg.getBotChatMember(chatId, this.token);
      return member.status === 'administrator' || member.status === 'creator';
    } catch {
      return false;
    }
  }
}
