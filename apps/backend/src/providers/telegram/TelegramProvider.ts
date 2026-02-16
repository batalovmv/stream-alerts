import type { MessengerProvider, AnnouncementData, SendResult, ChatInfo } from '../types.js';
import * as tg from './telegramApi.js';
import { logger } from '../../lib/logger.js';

export class TelegramProvider implements MessengerProvider {
  readonly name = 'telegram';

  async sendAnnouncement(chatId: string, data: AnnouncementData): Promise<SendResult> {
    if (data.photoUrl) {
      const msg = await tg.sendPhoto({
        chatId,
        photoUrl: data.photoUrl,
        caption: data.text,
        buttons: data.buttons,
        silent: data.silent,
      });
      return { messageId: String(msg.message_id) };
    }

    const msg = await tg.sendMessage({
      chatId,
      text: data.text,
      buttons: data.buttons,
      silent: data.silent,
    });
    return { messageId: String(msg.message_id) };
  }

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    const numericId = parseInt(messageId, 10);
    if (!Number.isFinite(numericId)) {
      logger.warn({ chatId, messageId }, 'telegram.deleteMessage: invalid message ID');
      return;
    }
    await tg.deleteMessageApi(chatId, numericId);
  }

  async getChatInfo(chatId: string): Promise<ChatInfo> {
    const chat = await tg.getChat(chatId);
    let memberCount: number | undefined;
    try {
      memberCount = await tg.getChatMemberCount(chatId);
    } catch {
      // member count may not be available for all chat types
    }

    return {
      title: chat.title ?? 'Private Chat',
      type: chat.type as ChatInfo['type'],
      memberCount,
    };
  }

  async validateBotAccess(chatId: string): Promise<boolean> {
    try {
      const member = await tg.getBotChatMember(chatId);
      return member.status === 'administrator' || member.status === 'creator';
    } catch {
      return false;
    }
  }
}
