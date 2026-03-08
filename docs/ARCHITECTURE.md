# MemeLab Notify — Техническая архитектура

## Обзор

```
┌─────────────────────────────────────────────────────────────┐
│                     MemeLab Backend                         │
│                     (monorepo)                              │
│                                                             │
│  EventSub: stream.online/offline                            │
│       └──→ POST notify.memelab.ru/api/webhooks/stream       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  MemeLab Notify Backend                      │
│                                                             │
│  ┌──────────┐   ┌──────────┐   ┌────────────────────────┐  │
│  │ Express  │   │ BullMQ   │   │   Provider Registry    │  │
│  │ API      │──→│ Queue    │──→│                        │  │
│  │          │   │          │   │  ┌──────────────────┐  │  │
│  │ - auth   │   │ - retry  │   │  │ TelegramProvider │  │  │
│  │ - chats  │   │ - backoff│   │  └──────────────────┘  │  │
│  │ - webhook│   │ - dedup  │   │  ┌──────────────────┐  │  │
│  └──────────┘   └──────────┘   │  │ MaxProvider      │  │  │
│       │                         │  └──────────────────┘  │  │
│  ┌──────────┐                  │  ┌──────────────────┐  │  │
│  │ Telegram │                  │  │ Future providers │  │  │
│  │ Bot      │                  │  └──────────────────┘  │  │
│  │ (cmds)   │                  └────────────────────────┘  │
│  └──────────┘                                              │
│       │                                                     │
│  ┌──────────┐   ┌──────────┐                               │
│  │PostgreSQL│   │  Redis   │                               │
│  └──────────┘   └──────────┘                               │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌──────────────────────┐   ┌──────────────────────┐
│  Telegram Bot API    │   │   MAX Bot API        │
│  api.telegram.org    │   │   platform-api.max.ru│
└──────────────────────┘   └──────────────────────┘
```

---

## Структура проекта

```
.ai/
├── context/                 # Постоянный AI-контекст и актуальный статус
├── decisions/               # Зафиксированные технические решения
├── handoffs/                # Передача незавершённой работы
└── tasks/                   # Бэклог, активные и завершённые задачи

scripts/
└── ai.js                    # CLI для AI-задач, handoff, ADR и soft-check

apps/backend/
├── src/
│   ├── api/                    # REST API
│   │   ├── routes/
│   │   │   ├── auth.ts         # OAuth endpoints
│   │   │   ├── chats.ts        # Connected chats CRUD
│   │   │   ├── streamer.ts     # Streamer settings
│   │   │   └── webhooks.ts     # Webhook handlers
│   │   └── middleware/
│   │       ├── auth.ts         # JWT cookie auth
│   │       ├── webhookAuth.ts  # Webhook secret verification
│   │       └── validation.ts   # Zod validation
│   │
│   ├── providers/              # Messenger providers
│   │   ├── types.ts            # MessengerProvider interface
│   │   ├── registry.ts         # Provider registry
│   │   ├── resolveProvider.ts  # Custom bot vs global bot selection
│   │   ├── telegram/
│   │   │   ├── TelegramProvider.ts
│   │   │   └── telegramApi.ts  # Raw API calls
│   │   └── max/
│   │       ├── MaxProvider.ts
│   │       └── maxApi.ts
│   │
│   ├── bot/                    # Telegram bot (commands)
│   │   ├── setup.ts            # Bot setup (polling/webhook)
│   │   ├── commands/
│   │   │   ├── start.ts
│   │   │   ├── channels.ts
│   │   │   ├── test.ts
│   │   │   ├── settings.ts
│   │   │   └── link.ts
│   │   └── callbacks/          # Inline button handlers
│   │       ├── toggleChannel.ts
│   │       └── selectChannel.ts
│   │
│   ├── services/               # Business logic
│   │   ├── announcementService.ts
│   │   ├── chatService.ts
│   │   ├── streamerService.ts
│   │   └── templateService.ts
│   │
│   ├── workers/                # BullMQ queue + worker
│   │   └── announcementQueue.ts
│   │
│   ├── lib/                    # Shared utilities
│   │   ├── config.ts
│   │   ├── prisma.ts
│   │   ├── redis.ts
│   │   ├── logger.ts
│   │   ├── sentry.ts
│   │   └── encryption.ts       # AES-256-GCM for custom bot tokens
│   │
│   └── index.ts                # Entry point
│
├── prisma/
│   └── schema.prisma           # Database schema
│
├── .env.example
└── package.json

apps/frontend/
├── src/
│   ├── pages/
│   │   ├── Landing.tsx         # Главная страница
│   │   ├── Dashboard.tsx       # Dashboard стримера
│   │   ├── ChatSettings.tsx    # Настройки канала
│   │   └── Login.tsx           # OAuth redirect
│   │
│   ├── components/
│   │   ├── ErrorBoundary.tsx   # Three-level error boundary
│   │   ├── layout/
│   │   ├── chat/
│   │   └── template/
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useChats.ts
│   │   └── useSettings.ts
│   │
│   ├── api/
│   │   └── client.ts           # API client (with 401 global handler)
│   │
│   ├── styles/
│   │   └── globals.css
│   │
│   └── main.tsx
│
├── index.html
├── vite.config.ts
└── package.json
```

---

## Модель данных

### ER-диаграмма

```
┌────────────────────┐       ┌─────────────────┐       ┌──────────────────┐
│     Streamer       │──1:N──│  ConnectedChat  │──1:N──│ AnnouncementLog  │
│                    │       │                 │       │                  │
│ id                 │       │ id              │       │ id               │
│ memelabUserId      │       │ streamerId   FK │       │ chatId        FK │
│ memelabChannelId   │       │ provider        │       │ streamSessionId  │
│ channelSlug        │       │ chatId          │       │ providerMsgId    │
│ twitchLogin        │       │ chatTitle       │       │ provider         │
│ displayName        │       │ chatType        │       │ status           │
│ avatarUrl          │       │ enabled         │       │ error            │
│ defaultTemplate    │       │ deleteAfterEnd  │       │ attempts         │
│ streamPlatforms    │       │ customTemplate  │       │ queuedAt         │
│ customButtons      │       │ lastMessageId   │       │ sentAt           │
│ photoType          │       │ lastAnnouncedAt │       │ deletedAt        │
│ customBotToken     │       │ createdAt       │       └──────────────────┘
│ customBotUsername   │       └─────────────────┘
│ telegramUserId     │
│ createdAt          │
└────────────────────┘
```

### Prisma Schema

```prisma
model Streamer {
  id                String    @id @default(uuid())
  memelabUserId     String    @unique
  memelabChannelId  String    @unique
  channelSlug       String    @default("")
  twitchLogin       String?
  displayName       String
  avatarUrl         String?

  // Default announcement settings
  defaultTemplate   String?   @db.Text

  // Stream platforms (Twitch, YouTube, VK, Kick, etc.)
  // JSON array: [{ platform, login, url, isManual }]
  streamPlatforms   Json?     @db.JsonB

  // Custom inline buttons for announcements (streamer-level)
  // JSON array: [{ label, url }] — null = default buttons, [] = no buttons
  customButtons     Json?     @db.JsonB

  // Photo type for announcements
  photoType         PhotoType @default(stream_preview)

  // Custom Telegram bot for announcements (optional)
  customBotToken    String?   @db.Text    // Encrypted bot token (AES-256-GCM)
  customBotUsername String?               // @username of the custom bot (for display)

  // Telegram bot linking (for bot commands)
  telegramUserId    String?   @unique

  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  chats             ConnectedChat[]

  @@index([twitchLogin])
}

enum PhotoType {
  stream_preview
  game_box_art
  none
}

enum MessengerProvider {
  telegram
  max
}

model ConnectedChat {
  id              String            @id @default(uuid())
  streamerId      String
  provider        MessengerProvider
  chatId          String            // Provider-specific chat identifier
  chatTitle       String?
  chatType        String?           // channel | group | supergroup

  // Settings
  enabled         Boolean  @default(true)
  deleteAfterEnd  Boolean  @default(false)
  customTemplate  String?  @db.Text

  // Tracking
  lastMessageId   String?           // Last sent announcement message ID (for deletion)
  lastAnnouncedAt DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  streamer        Streamer @relation(fields: [streamerId], references: [id], onDelete: Cascade)
  announcements   AnnouncementLog[]

  @@unique([streamerId, provider, chatId])
  @@index([streamerId, enabled])
  @@index([provider, chatId])
}

enum AnnouncementStatus {
  queued
  sent
  deleted
  failed
}

model AnnouncementLog {
  id              String             @id @default(uuid())
  chatId          String
  streamSessionId String?            // From MemeLab webhook
  provider        MessengerProvider
  providerMsgId   String?            // Message ID from messenger API (for deletion)

  status          AnnouncementStatus @default(sent)
  error           String?            @db.Text
  attempts        Int                @default(0)

  queuedAt        DateTime           @default(now())
  sentAt          DateTime?
  deletedAt       DateTime?

  chat            ConnectedChat      @relation(fields: [chatId], references: [id], onDelete: Cascade)

  @@index([chatId, status])
  @@index([chatId, streamSessionId, status])
  @@index([streamSessionId])
  @@index([status, queuedAt])
}
```

---

## Provider Interface

```typescript
// apps/backend/src/providers/types.ts

export interface AnnouncementData {
  text: string;
  photoUrl?: string;
  buttons?: Array<{
    label: string;
    url: string;
  }>;
  silent?: boolean;
}

export interface SendResult {
  messageId: string;
}

export interface ChatInfo {
  title: string;
  type: 'channel' | 'group' | 'supergroup' | 'private';
  memberCount?: number;
}

export interface MessengerProvider {
  readonly name: string;

  sendAnnouncement(chatId: string, data: AnnouncementData): Promise<SendResult>;
  deleteMessage(chatId: string, messageId: string): Promise<void>;
  getChatInfo(chatId: string): Promise<ChatInfo>;
  validateBotAccess(chatId: string): Promise<boolean>;
}
```

### Custom Bot Resolution

When a streamer has a `customBotToken`, the system uses their custom bot for sending announcements. Otherwise, the global `@MemelabNotifyBot` is used. Custom tokens are encrypted with AES-256-GCM at rest.

---

## API Endpoints

### Authentication

```
GET  /api/auth/memelab            → Redirect to MemeLab OAuth
GET  /api/auth/memelab/callback   → Handle OAuth callback, set JWT cookie
POST /api/auth/logout             → Clear JWT cookie
GET  /api/auth/me                 → Current user info
```

### Connected Chats

```
GET    /api/chats                 → List all connected chats
POST   /api/chats                 → Connect new chat
         Body: { provider, chatId }
PATCH  /api/chats/:id             → Update chat settings
         Body: { enabled?, deleteAfterEnd?, customTemplate? }
DELETE /api/chats/:id             → Disconnect chat
POST   /api/chats/:id/test       → Send test announcement
```

### Streamer Settings

```
GET    /api/streamer              → Streamer profile & settings
PATCH  /api/streamer              → Update settings
         Body: { defaultTemplate?, photoType?, customButtons?,
                 streamPlatforms?, customBotToken? }
```

### Webhooks

```
POST   /api/webhooks/stream       → Stream event from MemeLab
         Headers: X-Webhook-Secret
         Body: { event, channelId, channelSlug, ... }
```

---

## Announcement Queue

### Flow

```
Webhook received
       │
       ▼
announcementService.processStreamEvent()
       │
       ├─ Find all enabled chats for streamer
       ├─ Generate announcement text from template
       ├─ Enqueue BullMQ jobs (dedup by channelId + startedAt)
       │
       ▼
Worker processes job
       │
       ├─ Resolve provider (custom bot or global)
       ├─ Call provider.sendAnnouncement()
       ├─ Update AnnouncementLog (status: sent, providerMsgId)
       ├─ Update ConnectedChat.lastMessageId
       │
       ▼
Done (or retry on failure)
```

### Queue Configuration

```
Queue name: 'announcements'
Retry: 3 attempts
Backoff: exponential (5s base)
Concurrency: 5
Rate limit: 30 jobs/sec
Dedup: deterministic jobId for stream.online events
```

### Delete Flow (stream.offline)

```
Webhook: stream.offline
       │
       ▼
Find chats with deleteAfterEnd=true AND lastMessageId != null
       │
       ├─ Enqueue delete jobs
       │
       ▼
Worker:
       ├─ Call provider.deleteMessage(chatId, lastMessageId)
       ├─ Update AnnouncementLog (status: deleted)
       └─ Clear ConnectedChat.lastMessageId
```

---

## Telegram Bot

### Architecture

Бот работает в том же процессе что и API (одно приложение).
Используется Long Polling для development, Webhook для production.

### Command Flow

```
User sends /channels
       │
       ▼
Bot middleware: check if user is linked streamer
       │
       ├─ YES: Show streamer channels
       │       ├─ Inline buttons: [Toggle] [Settings] [Test]
       │       └─ Callback handlers update DB
       │
       └─ NO: "Привяжите аккаунт: /link"
```

### Linking Flow

```
User sends /link
       │
       ▼
Bot generates unique link:
  notify.memelab.ru/api/auth/telegram-link?token=<one-time-token>
       │
       ▼
User opens link → OAuth through MemeLab → callback
       │
       ▼
Backend links telegramUserId to Streamer record
       │
       ▼
Bot confirms: "Аккаунт привязан!"
```

---

## Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=development
PUBLIC_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/memelab_notify

# Redis
REDIS_URL=redis://localhost:6379

# MemeLab API
MEMELAB_API_URL=https://memelab.ru/api

# Webhook
WEBHOOK_SECRET=shared-secret-with-memelab

# JWT Cookie
JWT_COOKIE_NAME=token

# Telegram Bot
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
# TELEGRAM_WEBHOOK_SECRET=<production only>

# Encryption key for custom bot tokens (32-byte hex)
BOT_TOKEN_ENCRYPTION_KEY=

# Sentry (optional)
# SENTRY_DSN=https://...@sentry.io/...

# MAX Bot (Phase 3 — disabled until dev.max.ru access)
# MAX_BOT_TOKEN=

# Frontend
# VITE_SENTRY_DSN=https://...@sentry.io/...
```

---

## Security

### Webhook Verification
- `X-Webhook-Secret` header validation against `WEBHOOK_SECRET`

### Authentication
- JWT cookies (HTTPOnly, SameSite=Strict)
- CSRF protection via Origin header check
- Redis-backed rate limiting

### Encryption
- Custom bot tokens encrypted with AES-256-GCM at rest
- `BOT_TOKEN_ENCRYPTION_KEY` env var (32-byte hex)

### Input Validation
- Zod schemas for all API inputs
- Template sanitization (prevent XSS)
- Chat ID format validation per provider
- URL validation for custom buttons

---

## Deployment

| Environment | Trigger | URL |
|------------|---------|-----|
| Development | Local | localhost:3000 / localhost:5173 |
| Production | Push to main | notify.memelab.ru |

### Infrastructure
- **Server**: VPS (notify.memelab.ru)
- **Database**: PostgreSQL
- **Redis**: For BullMQ, rate limiting, dedup locks
- **Process manager**: PM2
- **Reverse proxy**: Nginx
- **CI/CD**: GitHub Actions → self-hosted runner
- **Monitoring**: Sentry (optional)

---

*Последнее обновление: 2026-03-08*
