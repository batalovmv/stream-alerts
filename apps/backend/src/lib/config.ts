function env(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

export const config = {
  port: parseInt(env('PORT', '3000'), 10),
  nodeEnv: env('NODE_ENV', 'development'),
  isDev: env('NODE_ENV', 'development') === 'development',

  // Database
  databaseUrl: env('DATABASE_URL', ''),

  // Redis
  redisUrl: env('REDIS_URL', 'redis://localhost:6379'),

  // MemeLab OAuth
  memelabClientId: env('MEMELAB_CLIENT_ID', ''),
  memelabClientSecret: env('MEMELAB_CLIENT_SECRET', ''),
  memelabOAuthUrl: env('MEMELAB_OAUTH_URL', 'https://memelab.ru/oauth'),
  memelabApiUrl: env('MEMELAB_API_URL', 'https://memelab.ru/api'),

  // Webhook
  webhookSecret: env('WEBHOOK_SECRET', ''),

  // Session
  sessionSecret: env('SESSION_SECRET', 'dev-session-secret'),

  // JWT Cookie
  jwtCookieName: env('JWT_COOKIE_NAME', 'token'),

  // Telegram Bot
  telegramBotToken: env('TELEGRAM_BOT_TOKEN', ''),

  // MAX Bot (Phase 3)
  maxBotToken: env('MAX_BOT_TOKEN', ''),
} as const;
