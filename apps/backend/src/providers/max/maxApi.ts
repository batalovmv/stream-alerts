/**
 * Low-level MAX Bot API client.
 *
 * Uses native fetch — same approach as Telegram provider.
 * API docs: https://dev.max.ru/docs-api
 */

import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';

const MAX_API = 'https://platform-api.max.ru';
const TIMEOUT_MS = 15_000;

interface MaxResponse<T> {
  [key: string]: unknown;
  error?: { code: string; message: string };
}

interface MaxMessage {
  body: {
    mid: string;
    seq: number;
    text?: string;
  };
}

interface MaxChat {
  chat_id: number;
  type: string;
  title: string;
  participants_count?: number;
}

interface MaxMembership {
  is_admin: boolean;
  is_owner: boolean;
}

// ─── Helpers ──────────────────────────────────────────────

async function callApi<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${MAX_API}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': config.maxBotToken,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = (await res.json()) as T & { error?: { code: string; message: string } };

    if (!res.ok || data.error) {
      const code = data.error?.code ?? String(res.status);
      const message = data.error?.message ?? 'Unknown MAX API error';
      throw new MaxApiError(res.status, code, message);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Error class ──────────────────────────────────────────

export class MaxApiError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly code: string,
    public readonly description: string,
  ) {
    super(`MAX API ${httpStatus} (${code}): ${description}`);
    this.name = 'MaxApiError';
  }

  get permanent(): boolean {
    return this.httpStatus === 403 || this.httpStatus === 404;
  }

  get retryable(): boolean {
    return this.httpStatus === 429 || this.httpStatus >= 500;
  }
}

// ─── Public API ───────────────────────────────────────────

export async function sendMessage(params: {
  chatId: string;
  text: string;
  photoUrl?: string;
  buttons?: Array<{ label: string; url: string }>;
}): Promise<{ messageId: string }> {
  const attachments: Array<Record<string, unknown>> = [];

  // Inline keyboard buttons
  if (params.buttons?.length) {
    attachments.push({
      type: 'inline_keyboard',
      payload: {
        buttons: [params.buttons.map((b) => ({
          type: 'link',
          text: b.label,
          url: b.url,
        }))],
      },
    });
  }

  // Photo attachment (if available)
  if (params.photoUrl) {
    attachments.push({
      type: 'image',
      payload: { url: params.photoUrl },
    });
  }

  const body: Record<string, unknown> = {
    chat_id: params.chatId,
    text: params.text,
    format: 'html',
  };

  if (attachments.length > 0) {
    body.attachments = attachments;
  }

  const result = await callApi<{ message: { body: { mid: string } } }>('POST', '/messages', body);
  return { messageId: result.message.body.mid };
}

export async function editMessage(params: {
  messageId: string;
  text: string;
  buttons?: Array<{ label: string; url: string }>;
}): Promise<void> {
  const attachments: Array<Record<string, unknown>> = [];

  if (params.buttons?.length) {
    attachments.push({
      type: 'inline_keyboard',
      payload: {
        buttons: [params.buttons.map((b) => ({
          type: 'link',
          text: b.label,
          url: b.url,
        }))],
      },
    });
  }

  const body: Record<string, unknown> = {
    text: params.text,
    format: 'html',
  };

  if (attachments.length > 0) {
    body.attachments = attachments;
  }

  await callApi<unknown>('PUT', `/messages/${params.messageId}`, body);
}

export async function deleteMessage(messageId: string): Promise<void> {
  try {
    await callApi<unknown>('DELETE', `/messages/${messageId}`);
  } catch (error) {
    if (error instanceof MaxApiError && error.httpStatus === 404) {
      logger.info({ messageId }, 'max.deleteMessage: already deleted');
      return;
    }
    throw error;
  }
}

export async function getChat(chatId: string): Promise<MaxChat> {
  return callApi<MaxChat>('GET', `/chats/${chatId}`);
}

export async function getBotMembership(chatId: string): Promise<MaxMembership> {
  return callApi<MaxMembership>('GET', `/chats/${chatId}/members/me`);
}
