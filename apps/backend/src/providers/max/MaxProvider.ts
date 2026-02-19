import type { MessengerProvider, AnnouncementData, SendResult, ChatInfo } from '../types.js';
import * as max from './maxApi.js';
import { logger } from '../../lib/logger.js';

export class MaxProvider implements MessengerProvider {
  readonly name = 'max';

  async sendAnnouncement(chatId: string, data: AnnouncementData): Promise<SendResult> {
    const result = await max.sendMessage({
      chatId,
      text: data.text,
      photoUrl: data.photoUrl,
      buttons: data.buttons,
      silent: data.silent,
    });
    return { messageId: result.messageId };
  }

  async editAnnouncement(chatId: string, messageId: string, data: AnnouncementData): Promise<void> {
    await max.editMessage({
      chatId,
      messageId,
      text: data.text,
      buttons: data.buttons,
    });
  }

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    await max.deleteMessage(chatId, messageId);
  }

  async getChatInfo(chatId: string): Promise<ChatInfo> {
    const chat = await max.getChat(chatId);
    return {
      title: chat.title,
      type: chat.type === 'channel' ? 'channel' : 'group',
      memberCount: chat.participants_count,
    };
  }

  async validateBotAccess(chatId: string): Promise<boolean> {
    try {
      const membership = await max.getBotMembership(chatId);
      return membership.is_admin || membership.is_owner;
    } catch {
      return false;
    }
  }
}
