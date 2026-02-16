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
apps/backend/
├── src/
│   ├── api/                    # REST API
│   │   ├── routes/
│   │   │   ├── auth.ts         # OAuth endpoints
│   │   │   ├── chats.ts        # Connected chats CRUD
│   │   │   ├── settings.ts     # Streamer settings
│   │   │   └── webhooks.ts     # Webhook handlers
│   │   └── middleware/
│   │       ├── auth.ts         # JWT/session auth
│   │       ├── webhookAuth.ts  # Webhook secret verification
│   │       └── validation.ts   # Zod validation
│   │
│   ├── providers/              # Messenger providers
│   │   ├── types.ts            # MessengerProvider interface
│   │   ├── registry.ts         # Provider registry
│   │   ├── telegram/
│   │   │   ├── TelegramProvider.ts
│   │   │   └── telegramApi.ts  # Raw API calls
│   │   └── max/
│   │       ├── MaxProvider.ts
│   │       └── maxApi.ts
│   │
│   ├── bot/                    # Telegram bot (commands)
│   │   ├── bot.ts              # Bot setup
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
│   ├── workers/                # BullMQ workers
│   │   └── announcementWorker.ts
│   │
│   ├── queues/                 # BullMQ queue definitions
│   │   └── announcementQueue.ts
│   │
│   ├── lib/                    # Shared utilities
│   │   ├── prisma.ts
│   │   ├── redis.ts
│   │   ├── logger.ts
│   │   └── config.ts
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
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Layout.tsx
│   │   ├── chat/
│   │   │   ├── ChatCard.tsx
│   │   │   ├── AddChatModal.tsx
│   │   │   └── ChatSettings.tsx
│   │   ├── template/
│   │   │   ├── TemplateEditor.tsx
│   │   │   └── TemplatePreview.tsx
│   │   └── ui/                 # Shared UI components
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── Input.tsx
│   │       └── Toggle.tsx
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useChats.ts
│   │   └── useSettings.ts
│   │
│   ├── api/
│   │   └── client.ts           # API client
│   │
│   ├── styles/
│   │   └── globals.css         # Tailwind + custom styles
│   │
│   └── main.tsx
│
├── index.html
├── tailwind.config.ts
├── vite.config.ts
└── package.json
```

---

## Модель данных

### ER-диаграмма

```
┌──────────────┐       ┌─────────────────┐       ┌──────────────────┐
│   Streamer   │──1:N──│  ConnectedChat  │──1:N──│ AnnouncementLog  │
│              │       │                 │       │                  │
│ id           │       │ id              │       │ id               │
│ memelabUserId│       │ streamerId   FK │       │ chatId        FK │
│ memlabChId   │       │ provider        │       │ streamSessionId  │
│ twitchLogin  │       │ chatId          │       │ messageId        │
│ displayName  │       │ chatTitle       │       │ status           │
│ avatarUrl    │       │ chatType        │       │ sentAt           │
│ defaultTempl │       │ enabled         │       │ deletedAt        │
│ previewMode  │       │ deleteAfterEnd  │       │ error            │
│ telegramId   │       │ customTemplate  │       └──────────────────┘
│ createdAt    │       │ lastMessageId   │
└──────────────┘       │ lastAnnounceAt  │
                       │ createdAt       │
                       └─────────────────┘
```

### Prisma Schema

```prisma
model Streamer {
  id              String   @id @default(uuid())
  memelabUserId   String   @unique
  memelabChannelId String  @unique
  twitchLogin     String?
  displayName     String
  avatarUrl       String?

  // Settings
  defaultTemplate String?  @db.Text
  previewMode     String   @default("twitch") // twitch | custom | none

  // Bot linking
  telegramUserId  String?  @unique  // Telegram user ID (for bot commands)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  chats           ConnectedChat[]
}

enum MessengerProvider {
  telegram
  max
}

model ConnectedChat {
  id              String            @id @default(uuid())
  streamerId      String
  provider        MessengerProvider
  chatId          String            // Provider-specific chat ID
  chatTitle       String?
  chatType        String?           // channel | group | supergroup

  // Settings
  enabled         Boolean  @default(true)
  deleteAfterEnd  Boolean  @default(false)
  customTemplate  String?  @db.Text

  // Tracking
  lastMessageId   String?           // Last sent message ID (for deletion)
  lastAnnouncedAt DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  streamer        Streamer @relation(fields: [streamerId], references: [id], onDelete: Cascade)
  announcements   AnnouncementLog[]

  @@unique([streamerId, provider, chatId])
  @@index([streamerId])
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
  providerMsgId   String?            // Message ID from provider (for deletion)

  status          AnnouncementStatus @default(queued)
  error           String?            @db.Text

  // Timestamps
  queuedAt        DateTime           @default(now())
  sentAt          DateTime?
  deletedAt       DateTime?

  chat            ConnectedChat      @relation(fields: [chatId], references: [id], onDelete: Cascade)

  @@index([chatId, status])
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

### Provider Registry

```typescript
// apps/backend/src/providers/registry.ts

const providers = new Map<string, MessengerProvider>();

export function registerProvider(provider: MessengerProvider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): MessengerProvider {
  const provider = providers.get(name);
  if (!provider) throw new Error(`Provider "${name}" not registered`);
  return provider;
}

export function getAllProviders(): MessengerProvider[] {
  return Array.from(providers.values());
}
```

---

## API Endpoints

### Authentication

```
GET  /api/auth/memelab            → Redirect to MemeLab OAuth
GET  /api/auth/memelab/callback   → Handle OAuth callback, set session
POST /api/auth/logout             → Clear session
GET  /api/auth/me                 → Current user info
```

### Connected Chats

```
GET    /api/chats                 → List all connected chats
POST   /api/chats                 → Connect new chat
         Body: { provider, chatId }
         Returns: ConnectedChat
PATCH  /api/chats/:id             → Update chat settings
         Body: { enabled?, deleteAfterEnd?, customTemplate? }
DELETE /api/chats/:id             → Disconnect chat
POST   /api/chats/:id/test       → Send test announcement
```

### Settings

```
GET    /api/settings              → Streamer settings
PATCH  /api/settings              → Update settings
         Body: { defaultTemplate?, previewMode? }
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
       ├─ Create AnnouncementLog records (status: queued)
       ├─ Enqueue BullMQ jobs
       │
       ▼
announcementWorker processes job
       │
       ├─ Get provider for chat
       ├─ Call provider.sendAnnouncement()
       ├─ Update AnnouncementLog (status: sent, providerMsgId)
       ├─ Update ConnectedChat.lastMessageId
       │
       ▼
Done (or retry on failure)
```

### Queue Configuration

```typescript
// apps/backend/src/queues/announcementQueue.ts

Queue name: 'announcements'
Job types:
  - 'send'    → Send announcement to chat
  - 'delete'  → Delete previous announcement

Retry: 5 attempts
Backoff: [2s, 10s, 30s, 120s, 300s]
Concurrency: 10
```

### Delete Flow (stream.offline)

```
Webhook: stream.offline
       │
       ▼
Find chats with deleteAfterEnd=true AND lastMessageId != null
       │
       ├─ Enqueue 'delete' jobs
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

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/memelab_notify

# Redis
REDIS_URL=redis://localhost:6379

# MemeLab OAuth
MEMELAB_CLIENT_ID=notify-app
MEMELAB_CLIENT_SECRET=secret
MEMELAB_OAUTH_URL=https://memelab.ru/oauth
MEMELAB_API_URL=https://memelab.ru/api

# Webhook
WEBHOOK_SECRET=shared-secret-with-memelab

# Session
SESSION_SECRET=random-session-secret

# Telegram Bot
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# MAX Bot (Phase 3)
MAX_BOT_TOKEN=max-bot-token

# Frontend
VITE_API_URL=http://localhost:3000/api
```

---

## Security

### Webhook Verification
```typescript
// Verify webhook secret
function verifyWebhook(req: Request): boolean {
  const secret = req.headers['x-webhook-secret'];
  return secret === process.env.WEBHOOK_SECRET;
}
```

### Session Management
- Express-session with Redis store
- HTTPOnly cookies
- CSRF protection

### Input Validation
- Zod schemas for all API inputs
- Template sanitization (prevent XSS in templates)
- Chat ID format validation per provider

---

## Deployment

| Environment | Trigger | URL |
|------------|---------|-----|
| Development | Local | localhost:3000 / localhost:5173 |
| Production | Push to main | notify.memelab.ru |

### Infrastructure
- **Server**: Same VPS as MemeLab (or separate)
- **Database**: PostgreSQL (shared or separate instance)
- **Redis**: Shared with MemeLab or separate
- **Process manager**: PM2
- **Reverse proxy**: Nginx

---

*Последнее обновление: 2026-02-16*
