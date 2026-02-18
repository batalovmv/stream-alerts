/**
 * Low-level Telegram Bot API client.
 * Uses native fetch — no external Telegram libraries.
 */

import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';

const TELEGRAM_API = 'https://api.telegram.org';
const TIMEOUT_MS = 15_000;

// ─── Types ───────────────────────────────────────────────

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string; title?: string };
  from?: { id: number; is_bot: boolean; first_name: string; username?: string };
  date: number;
  text?: string;
  caption?: string;
  chat_shared?: {
    request_id: number;
    chat_id: number;
    title?: string;
    username?: string;
  };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: { id: number; first_name: string; username?: string };
    message?: TelegramMessage;
    data?: string;
  };
  my_chat_member?: TelegramChatMemberUpdated;
}

export interface TelegramChatMemberUpdated {
  chat: TelegramChat;
  from: { id: number; first_name: string; username?: string };
  date: number;
  old_chat_member: { status: string; user: { id: number } };
  new_chat_member: { status: string; user: { id: number } };
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

// ─── Helpers ──────────────────────────────────────────────

function botUrl(method: string): string {
  return `${TELEGRAM_API}/bot${config.telegramBotToken}/${method}`;
}

export async function callApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(botUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = (await res.json()) as TelegramResponse<T>;

    if (!data.ok || data.result === undefined) {
      const code = data.error_code ?? res.status;
      const desc = data.description ?? 'Unknown Telegram API error';
      throw new TelegramApiError(code, desc);
    }

    return data.result;
  } catch (error) {
    // Re-throw TelegramApiError as-is
    if (error instanceof TelegramApiError) throw error;

    // Wrap network/timeout errors into TelegramApiError
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    const code = isTimeout ? 408 : 0;
    const desc = isTimeout
      ? `Request to ${method} timed out after ${TIMEOUT_MS}ms`
      : `Network error calling ${method}: ${error instanceof Error ? error.message : String(error)}`;
    throw new TelegramApiError(code, desc);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Error class ──────────────────────────────────────────

export class TelegramApiError extends Error {
  constructor(
    public readonly code: number,
    public readonly description: string,
  ) {
    super(`Telegram API ${code}: ${description}`);
    this.name = 'TelegramApiError';
  }

  /** Transient errors that make sense to retry */
  get retryable(): boolean {
    return this.code === 0 || this.code === 408 || this.code === 429 || this.code >= 500;
  }

  /** Bot was blocked or chat was deleted — disable subscription */
  get permanent(): boolean {
    return (
      (this.code === 403 && this.description.includes('bot was blocked')) ||
      (this.code === 403 && this.description.includes('bot was kicked')) ||
      (this.code === 400 && this.description.includes('chat not found'))
    );
  }
}

// ─── Cached Bot Info ──────────────────────────────────────

let cachedBotInfo: TelegramUser | null = null;

export async function getMe(): Promise<TelegramUser> {
  if (cachedBotInfo) return cachedBotInfo;
  cachedBotInfo = await callApi<TelegramUser>('getMe', {});
  return cachedBotInfo;
}

// ─── Public API ───────────────────────────────────────────

/** Send photo with caption and inline keyboard */
export async function sendPhoto(params: {
  chatId: string;
  photoUrl: string;
  caption?: string;
  parseMode?: string;
  buttons?: Array<{ label: string; url: string }>;
  silent?: boolean;
}): Promise<TelegramMessage> {
  const inlineKeyboard = params.buttons?.length
    ? { inline_keyboard: [params.buttons.map((b) => ({ text: b.label, url: b.url }))] }
    : undefined;

  return callApi<TelegramMessage>('sendPhoto', {
    chat_id: params.chatId,
    photo: params.photoUrl,
    caption: params.caption,
    parse_mode: params.parseMode ?? 'HTML',
    reply_markup: inlineKeyboard,
    disable_notification: params.silent ?? false,
  });
}

/** Send text message with optional inline keyboard or reply keyboard */
export async function sendMessage(params: {
  chatId: string;
  text: string;
  parseMode?: string;
  buttons?: Array<{ label: string; url: string }>;
  replyMarkup?: Record<string, unknown>;
  silent?: boolean;
}): Promise<TelegramMessage> {
  let replyMarkup = params.replyMarkup;

  if (!replyMarkup && params.buttons?.length) {
    replyMarkup = {
      inline_keyboard: [params.buttons.map((b) => ({ text: b.label, url: b.url }))],
    };
  }

  return callApi<TelegramMessage>('sendMessage', {
    chat_id: params.chatId,
    text: params.text,
    parse_mode: params.parseMode ?? 'HTML',
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
    disable_notification: params.silent ?? false,
  });
}

/** Edit text of an existing message with optional inline keyboard */
export async function editMessageText(params: {
  chatId: string;
  messageId: number;
  text: string;
  parseMode?: string;
  replyMarkup?: Record<string, unknown>;
}): Promise<TelegramMessage | boolean> {
  return callApi<TelegramMessage | boolean>('editMessageText', {
    chat_id: params.chatId,
    message_id: params.messageId,
    text: params.text,
    parse_mode: params.parseMode ?? 'HTML',
    disable_web_page_preview: true,
    reply_markup: params.replyMarkup,
  });
}

/** Edit message caption (for photo announcements) */
export async function editMessageCaption(params: {
  chatId: string;
  messageId: number;
  caption: string;
  parseMode?: string;
  buttons?: Array<{ label: string; url: string }>;
}): Promise<TelegramMessage> {
  const inlineKeyboard = params.buttons?.length
    ? { inline_keyboard: [params.buttons.map((b) => ({ text: b.label, url: b.url }))] }
    : undefined;

  return callApi<TelegramMessage>('editMessageCaption', {
    chat_id: params.chatId,
    message_id: params.messageId,
    caption: params.caption,
    parse_mode: params.parseMode ?? 'HTML',
    reply_markup: inlineKeyboard,
  });
}

/** Delete a message */
export async function deleteMessageApi(chatId: string, messageId: number): Promise<boolean> {
  try {
    return await callApi<boolean>('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
    });
  } catch (error) {
    // Ignore "message to delete not found" — already deleted
    if (error instanceof TelegramApiError && error.code === 400 && error.description.includes('message to delete not found')) {
      logger.info({ chatId, messageId }, 'telegram.deleteMessage: already deleted');
      return true;
    }
    throw error;
  }
}

/** Answer a callback query (required to dismiss loading state) */
export async function answerCallbackQuery(params: {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
}): Promise<boolean> {
  return callApi<boolean>('answerCallbackQuery', {
    callback_query_id: params.callbackQueryId,
    text: params.text,
    show_alert: params.showAlert ?? false,
  });
}

/** Get chat info */
export async function getChat(chatId: string | number): Promise<TelegramChat> {
  return callApi<TelegramChat>('getChat', { chat_id: chatId });
}

/** Get chat member count */
export async function getChatMemberCount(chatId: string | number): Promise<number> {
  return callApi<number>('getChatMemberCount', { chat_id: chatId });
}

/** Check if bot is admin in the chat */
export async function getBotChatMember(chatId: string | number): Promise<{ status: string }> {
  const botInfo = await getMe();
  return callApi<{ status: string }>('getChatMember', {
    chat_id: chatId,
    user_id: botInfo.id,
  });
}

/** Set webhook URL */
export async function setWebhook(url: string, secretToken: string): Promise<boolean> {
  return callApi<boolean>('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
    drop_pending_updates: false,
  });
}

/** Delete webhook (for switching to polling) */
export async function deleteWebhook(): Promise<boolean> {
  return callApi<boolean>('deleteWebhook', { drop_pending_updates: false });
}

/** Long-poll for updates (dev mode) */
export async function getUpdates(offset?: number): Promise<TelegramUpdate[]> {
  return callApi<TelegramUpdate[]>('getUpdates', {
    offset: offset ?? 0,
    timeout: 30,
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
  });
}

/** Set bot commands menu */
export async function setMyCommands(commands: Array<{ command: string; description: string }>): Promise<boolean> {
  return callApi<boolean>('setMyCommands', { commands });
}

/** Remove reply keyboard */
export async function removeReplyKeyboard(chatId: string | number, text: string): Promise<TelegramMessage> {
  return callApi<TelegramMessage>('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { remove_keyboard: true },
  });
}
