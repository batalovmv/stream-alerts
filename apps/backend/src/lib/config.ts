function env(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

const nodeEnv = env('NODE_ENV', 'development');

export const config = {
  port: parseInt(env('PORT', '3000'), 10),
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
  telegramBotToken: env('TELEGRAM_BOT_TOKEN', ''),

  // MAX Bot (Phase 3)
  maxBotToken: env('MAX_BOT_TOKEN', ''),
} as const;
