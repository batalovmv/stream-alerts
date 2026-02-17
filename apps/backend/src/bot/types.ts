import type { TelegramMessage, TelegramUpdate } from '../providers/telegram/telegramApi.js';

/** Context passed to every bot command/handler */
export interface BotContext {
  update: TelegramUpdate;
  message: TelegramMessage;
  chatId: number;
  userId: number;
  username?: string;
  text: string;
}

/** Context for callback query handlers */
export interface CallbackContext {
  update: TelegramUpdate;
  callbackQueryId: string;
  chatId: number;
  messageId: number;
  userId: number;
  data: string;
}
