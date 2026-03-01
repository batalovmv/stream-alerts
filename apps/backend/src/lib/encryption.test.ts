import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config with a controllable encryption key
const mockConfig = { botTokenEncryptionKey: '' };
vi.mock('./config.js', () => ({ config: mockConfig }));

// Must import AFTER vi.mock so the mock is active
const { encrypt, decrypt, isEncryptionAvailable } = await import('./encryption.js');

describe('encryption', () => {
  const VALID_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

  beforeEach(() => {
    mockConfig.botTokenEncryptionKey = VALID_KEY;
  });

  describe('isEncryptionAvailable', () => {
    it('returns true for valid 64-char hex key', () => {
      expect(isEncryptionAvailable()).toBe(true);
    });

    it('returns false for empty key', () => {
      mockConfig.botTokenEncryptionKey = '';
      expect(isEncryptionAvailable()).toBe(false);
    });

    it('returns false for non-hex 64-char key', () => {
      mockConfig.botTokenEncryptionKey = 'g'.repeat(64);
      expect(isEncryptionAvailable()).toBe(false);
    });

    it('returns false for short hex key', () => {
      mockConfig.botTokenEncryptionKey = 'abcdef';
      expect(isEncryptionAvailable()).toBe(false);
    });
  });

  describe('encrypt / decrypt round-trip', () => {
    it('encrypts and decrypts a bot token', () => {
      const token = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
      const encrypted = encrypt(token);
      expect(encrypted).not.toBe(token);
      expect(decrypt(encrypted)).toBe(token);
    });

    it('produces different ciphertext for same plaintext (random IV)', () => {
      const token = 'test-token';
      const a = encrypt(token);
      const b = encrypt(token);
      expect(a).not.toBe(b);
      // Both decrypt to the same value
      expect(decrypt(a)).toBe(token);
      expect(decrypt(b)).toBe(token);
    });

    it('handles empty string', () => {
      const encrypted = encrypt('');
      expect(decrypt(encrypted)).toBe('');
    });

    it('handles unicode', () => {
      const token = 'токен-бота-🤖';
      expect(decrypt(encrypt(token))).toBe(token);
    });
  });

  describe('error cases', () => {
    it('encrypt throws when key is not configured', () => {
      mockConfig.botTokenEncryptionKey = '';
      expect(() => encrypt('test')).toThrow('BOT_TOKEN_ENCRYPTION_KEY must be a 64-character hex string');
    });

    it('decrypt throws when key is not configured', () => {
      mockConfig.botTokenEncryptionKey = '';
      expect(() => decrypt('dGVzdA==')).toThrow('BOT_TOKEN_ENCRYPTION_KEY must be a 64-character hex string');
    });

    it('decrypt throws on tampered ciphertext', () => {
      const encrypted = encrypt('secret');
      // Tamper with the base64 payload
      const tampered = encrypted.slice(0, -4) + 'XXXX';
      expect(() => decrypt(tampered)).toThrow();
    });

    it('decrypt throws when using wrong key', () => {
      const encrypted = encrypt('secret');
      mockConfig.botTokenEncryptionKey = 'b'.repeat(64);
      expect(() => decrypt(encrypted)).toThrow();
    });
  });
});
