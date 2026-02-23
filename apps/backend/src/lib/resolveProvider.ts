/**
 * Shared provider resolution — uses custom bot token for Telegram if available,
 * falls back to global registered provider.
 */

import { getProvider } from '../providers/registry.js';
import { TelegramProvider } from '../providers/telegram/TelegramProvider.js';
import { decrypt, isEncryptionAvailable } from './encryption.js';
import { logger } from './logger.js';
import type { MessengerProvider } from '../providers/types.js';

export function resolveProvider(chatProvider: string, customBotToken: string | null | undefined): MessengerProvider {
  if (chatProvider === 'telegram' && customBotToken && isEncryptionAvailable()) {
    try {
      const token = decrypt(customBotToken);
      return new TelegramProvider(token);
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'custom_bot_decrypt_failed');
    }
  }
  return getProvider(chatProvider);
}
