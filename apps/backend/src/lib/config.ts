function env(key: string, fallback?: string): string {
  const raw = process.env[key];
  const value = raw !== undefined ? raw.trim() : undefined;
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

const nodeEnv = env('NODE_ENV', 'development');

export const config = {
  port: (() => { const p = parseInt(env('PORT', '3000'), 10); if (isNaN(p) || p < 1 || p > 65535) throw new Error('PORT must be a valid port number (1-65535)'); return p; })(),
  nodeEnv,
  isDev: nodeEnv === 'development',

  // Database (required — no silent empty-string fallback)
  databaseUrl: env('DATABASE_URL'),

  // Redis
  redisUrl: env('REDIS_URL', 'redis://localhost:6379'),

  // MemeLab API
  memelabApiUrl: env('MEMELAB_API_URL', 'https://memelab.ru/api'),

  // Webhook (required in production)
  webhookSecret: env('WEBHOOK_SECRET', nodeEnv === 'development' ? 'dev-webhook-secret' : undefined),

  // Session (required in production)
  sessionSecret: env('SESSION_SECRET', nodeEnv === 'development' ? 'dev-session-secret' : undefined),

  // JWT Cookie
  jwtCookieName: env('JWT_COOKIE_NAME', 'token'),

  // Telegram Bot
  telegramBotToken: env('TELEGRAM_BOT_TOKEN', nodeEnv === 'development' ? '' : undefined),

  // Telegram webhook secret (separate from MemeLab webhook secret)
  // Optional at config level — validated at runtime in startWebhook() when actually needed
  telegramWebhookSecret: env('TELEGRAM_WEBHOOK_SECRET', nodeEnv === 'development' ? 'dev-tg-webhook-secret' : ''),

  // Encryption key for custom bot tokens (32-byte hex, optional — feature disabled if empty)
  botTokenEncryptionKey: env('BOT_TOKEN_ENCRYPTION_KEY', ''),

  // MAX Bot (Phase 3 — optional until implemented)
  maxBotToken: env('MAX_BOT_TOKEN', ''),

  // Public URL (for webhook registration etc.)
  publicUrl: env('PUBLIC_URL', nodeEnv === 'development' ? 'http://localhost:3000' : 'https://notify.memelab.ru'),
} as const;
