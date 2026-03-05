import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────

vi.mock('../providers/registry.js', () => ({
  getProvider: vi.fn(),
}));

vi.mock('./encryption.js', () => ({
  isEncryptionAvailable: vi.fn(),
  decrypt: vi.fn(),
}));

vi.mock('../providers/telegram/TelegramProvider.js', () => ({
  TelegramProvider: vi.fn(),
}));

// ─── Imports (after vi.mock hoisting) ─────────────────────────

import { getProvider } from '../providers/registry.js';
import { TelegramProvider } from '../providers/telegram/TelegramProvider.js';

import { isEncryptionAvailable, decrypt } from './encryption.js';
import { resolveProvider } from './resolveProvider.js';

const mockGetProvider = getProvider as Mock;
const mockIsEncryptionAvailable = isEncryptionAvailable as Mock;
const mockDecrypt = decrypt as Mock;
const MockTelegramProvider = TelegramProvider as unknown as Mock;

// ─── Tests ────────────────────────────────────────────────────

describe('resolveProvider', () => {
  const mockRegistryProvider = { name: 'telegram' };
  const mockCustomProvider = { name: 'telegram-custom' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProvider.mockReturnValue(mockRegistryProvider);
    MockTelegramProvider.mockReturnValue(mockCustomProvider);
  });

  describe('non-telegram provider', () => {
    it('delegates to getProvider(chatProvider) for non-telegram provider', () => {
      const maxProvider = { name: 'max' };
      mockGetProvider.mockReturnValue(maxProvider);

      const result = resolveProvider('max', null);

      expect(mockGetProvider).toHaveBeenCalledOnce();
      expect(mockGetProvider).toHaveBeenCalledWith('max');
      expect(result).toBe(maxProvider);
    });

    it('does not interact with encryption for non-telegram provider', () => {
      resolveProvider('max', null);

      expect(mockIsEncryptionAvailable).not.toHaveBeenCalled();
      expect(mockDecrypt).not.toHaveBeenCalled();
      expect(MockTelegramProvider).not.toHaveBeenCalled();
    });
  });

  describe('telegram without customBotToken', () => {
    it('delegates to getProvider("telegram") when customBotToken is null', () => {
      const result = resolveProvider('telegram', null);

      expect(mockGetProvider).toHaveBeenCalledOnce();
      expect(mockGetProvider).toHaveBeenCalledWith('telegram');
      expect(result).toBe(mockRegistryProvider);
    });

    it('delegates to getProvider("telegram") when customBotToken is undefined', () => {
      const result = resolveProvider('telegram', undefined);

      expect(mockGetProvider).toHaveBeenCalledOnce();
      expect(mockGetProvider).toHaveBeenCalledWith('telegram');
      expect(result).toBe(mockRegistryProvider);
    });

    it('delegates to getProvider("telegram") when customBotToken is empty string', () => {
      const result = resolveProvider('telegram', '');

      expect(mockGetProvider).toHaveBeenCalledOnce();
      expect(mockGetProvider).toHaveBeenCalledWith('telegram');
      expect(result).toBe(mockRegistryProvider);
    });

    it('does not interact with encryption when customBotToken is absent', () => {
      resolveProvider('telegram', null);

      expect(mockIsEncryptionAvailable).not.toHaveBeenCalled();
      expect(mockDecrypt).not.toHaveBeenCalled();
      expect(MockTelegramProvider).not.toHaveBeenCalled();
    });
  });

  describe('telegram + customBotToken + encryption available', () => {
    const ENCRYPTED_TOKEN = 'enc:abc123';
    const PLAIN_TOKEN = '123456:ABCdef';

    beforeEach(() => {
      mockIsEncryptionAvailable.mockReturnValue(true);
      mockDecrypt.mockReturnValue(PLAIN_TOKEN);
    });

    it('decrypts the token and constructs a new TelegramProvider', () => {
      const result = resolveProvider('telegram', ENCRYPTED_TOKEN);

      expect(mockIsEncryptionAvailable).toHaveBeenCalledOnce();
      expect(mockDecrypt).toHaveBeenCalledOnce();
      expect(mockDecrypt).toHaveBeenCalledWith(ENCRYPTED_TOKEN);
      expect(MockTelegramProvider).toHaveBeenCalledOnce();
      expect(MockTelegramProvider).toHaveBeenCalledWith(PLAIN_TOKEN);
      expect(result).toBe(mockCustomProvider);
    });

    it('does not fall back to getProvider when custom token path is taken', () => {
      resolveProvider('telegram', ENCRYPTED_TOKEN);

      expect(mockGetProvider).not.toHaveBeenCalled();
    });
  });

  describe('telegram + customBotToken + encryption NOT available', () => {
    beforeEach(() => {
      mockIsEncryptionAvailable.mockReturnValue(false);
    });

    it('throws an error mentioning BOT_TOKEN_ENCRYPTION_KEY', () => {
      expect(() => resolveProvider('telegram', 'enc:abc123')).toThrow(
        'BOT_TOKEN_ENCRYPTION_KEY is not configured',
      );
    });

    it('does not attempt to decrypt when encryption is unavailable', () => {
      expect(() => resolveProvider('telegram', 'enc:abc123')).toThrow();

      expect(mockDecrypt).not.toHaveBeenCalled();
      expect(MockTelegramProvider).not.toHaveBeenCalled();
    });
  });

  describe('telegram + customBotToken + decrypt throws', () => {
    beforeEach(() => {
      mockIsEncryptionAvailable.mockReturnValue(true);
    });

    it('rethrows with a wrapped message when decrypt throws an Error', () => {
      mockDecrypt.mockImplementation(() => {
        throw new Error('bad MAC');
      });

      expect(() => resolveProvider('telegram', 'enc:corrupted')).toThrow(
        'Failed to decrypt custom bot token',
      );
    });

    it('wrapped error message includes the original error message', () => {
      const originalMessage = 'authentication tag mismatch';
      mockDecrypt.mockImplementation(() => {
        throw new Error(originalMessage);
      });

      expect(() => resolveProvider('telegram', 'enc:corrupted')).toThrow(originalMessage);
    });

    it('rethrows with a wrapped message when decrypt throws a non-Error', () => {
      mockDecrypt.mockImplementation(() => {
        throw 'string error';
      });

      expect(() => resolveProvider('telegram', 'enc:corrupted')).toThrow(
        'Failed to decrypt custom bot token',
      );
    });

    it('does not construct TelegramProvider when decrypt fails', () => {
      mockDecrypt.mockImplementation(() => {
        throw new Error('decrypt failed');
      });

      expect(() => resolveProvider('telegram', 'enc:corrupted')).toThrow();

      expect(MockTelegramProvider).not.toHaveBeenCalled();
    });
  });
});
