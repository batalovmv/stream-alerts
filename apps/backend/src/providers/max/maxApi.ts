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
        'Authorization': `Bearer ${config.maxBotToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
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
  } catch (error) {
    if (error instanceof MaxApiError) throw error;
    // Network / timeout errors
    const msg = error instanceof Error ? error.message : String(error);
    throw new MaxApiError(0, 'NETWORK_ERROR', msg);
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
    return this.httpStatus === 0 || this.httpStatus === 429 || this.httpStatus >= 500;
  }
}

// ─── Public API ───────────────────────────────────────────

/** Upload an image by URL and return the upload token for use in attachments */
async function uploadImageByUrl(photoUrl: string): Promise<{ token: string } | null> {
  try {
    // Step 1: Get upload URL from MAX API
    const uploadInfo = await callApi<{ url: string; token: string }>('POST', '/uploads', { type: 'image' });

    // Step 2: Fetch the image
    const imgRes = await fetch(photoUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!imgRes.ok) return null;
    const imgBuffer = await imgRes.arrayBuffer();

    // Step 3: Upload image to the provided URL
    const uploadRes = await fetch(uploadInfo.url, {
      method: 'POST',
      headers: { 'Content-Type': imgRes.headers.get('content-type') ?? 'image/jpeg' },
      body: imgBuffer,
    });
    if (!uploadRes.ok) return null;

    return { token: uploadInfo.token };
  } catch (error) {
    logger.warn({ photoUrl, error: error instanceof Error ? error.message : String(error) }, 'max.upload_image_failed');
    return null;
  }
}

export async function sendMessage(params: {
  chatId: string;
  text: string;
  photoUrl?: string;
  buttons?: Array<{ label: string; url: string }>;
  silent?: boolean;
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

  // Photo attachment — must upload first to get a token
  if (params.photoUrl) {
    const upload = await uploadImageByUrl(params.photoUrl);
    if (upload) {
      attachments.push({
        type: 'image',
        payload: { token: upload.token },
      });
    }
  }

  const body: Record<string, unknown> = {
    text: params.text,
    format: 'html',
    ...(params.silent ? { notify: false } : {}),
  };

  if (attachments.length > 0) {
    body.attachments = attachments;
  }

  const chatIdParam = encodeURIComponent(params.chatId);
  const result = await callApi<{ message: { body: { mid: string } } }>('POST', `/messages?chat_id=${chatIdParam}`, body);
  return { messageId: result.message.body.mid };
}

export async function editMessage(params: {
  chatId: string;
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

  const msgId = encodeURIComponent(params.messageId);
  await callApi<unknown>('PUT', `/messages?message_id=${msgId}`, body);
}

export async function deleteMessage(messageId: string): Promise<void> {
  try {
    const msgId = encodeURIComponent(messageId);
    await callApi<unknown>('DELETE', `/messages?message_id=${msgId}`);
  } catch (error) {
    if (error instanceof MaxApiError && error.httpStatus === 404) {
      logger.info({ messageId }, 'max.deleteMessage: already deleted');
      return;
    }
    throw error;
  }
}

export async function getChat(chatId: string): Promise<MaxChat> {
  return callApi<MaxChat>('GET', `/chats/${encodeURIComponent(chatId)}`);
}

export async function getBotMembership(chatId: string): Promise<MaxMembership> {
  return callApi<MaxMembership>('GET', `/chats/${encodeURIComponent(chatId)}/members/me`);
}
