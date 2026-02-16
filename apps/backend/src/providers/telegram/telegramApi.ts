/**
 * Low-level Telegram Bot API client.
 * Uses native fetch — no external Telegram libraries.
 */

import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';

const TELEGRAM_API = 'https://api.telegram.org';
const TIMEOUT_MS = 15_000;

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string; title?: string };
  date: number;
  text?: string;
  caption?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
}

interface TelegramChatMemberCount {
  // getChat returns full chat, getChatMemberCount returns a number
}

// ─── Helpers ──────────────────────────────────────────────

function botUrl(method: string): string {
  return `${TELEGRAM_API}/bot${config.telegramBotToken}/${method}`;
}

async function callApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
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
    return this.code === 429 || this.code >= 500;
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

/** Send text message with inline keyboard */
export async function sendMessage(params: {
  chatId: string;
  text: string;
  parseMode?: string;
  buttons?: Array<{ label: string; url: string }>;
  silent?: boolean;
}): Promise<TelegramMessage> {
  const inlineKeyboard = params.buttons?.length
    ? { inline_keyboard: [params.buttons.map((b) => ({ text: b.label, url: b.url }))] }
    : undefined;

  return callApi<TelegramMessage>('sendMessage', {
    chat_id: params.chatId,
    text: params.text,
    parse_mode: params.parseMode ?? 'HTML',
    disable_web_page_preview: true,
    reply_markup: inlineKeyboard,
    disable_notification: params.silent ?? false,
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

/** Get chat info */
export async function getChat(chatId: string): Promise<TelegramChat> {
  return callApi<TelegramChat>('getChat', { chat_id: chatId });
}

/** Get chat member count */
export async function getChatMemberCount(chatId: string): Promise<number> {
  return callApi<number>('getChatMemberCount', { chat_id: chatId });
}

/** Check if bot is admin in the chat */
export async function getBotChatMember(chatId: string): Promise<{ status: string }> {
  const botInfo = await callApi<{ id: number }>('getMe', {});
  return callApi<{ status: string }>('getChatMember', {
    chat_id: chatId,
    user_id: botInfo.id,
  });
}
