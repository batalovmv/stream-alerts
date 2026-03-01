/**
 * Shared provider resolution — uses custom bot token for Telegram if available,
 * falls back to global registered provider.
 */

import { getProvider } from '../providers/registry.js';
import { TelegramProvider } from '../providers/telegram/TelegramProvider.js';
import { decrypt, isEncryptionAvailable } from './encryption.js';
import type { MessengerProvider } from '../providers/types.js';

export function resolveProvider(chatProvider: string, customBotToken: string | null | undefined): MessengerProvider {
  if (chatProvider === 'telegram' && customBotToken) {
    if (!isEncryptionAvailable()) {
      throw new Error('Custom bot token is set but BOT_TOKEN_ENCRYPTION_KEY is not configured');
    }
    let token: string;
    try {
      token = decrypt(customBotToken);
    } catch (decryptError) {
      throw new Error(
        `Failed to decrypt custom bot token — encryption key may have changed or token is corrupted. ` +
        `Original: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`,
      );
    }
    return new TelegramProvider(token);
  }
  return getProvider(chatProvider);
}
