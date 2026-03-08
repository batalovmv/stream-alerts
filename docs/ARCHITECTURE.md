# MemeLab Notify - Technical Architecture

Last updated: 2026-03-09

## Overview

MemeLab Notify is a standalone service that receives stream status changes from the main MemeLab backend and delivers announcements asynchronously to messenger chats.

Current production path:

- MemeLab backend sends `stream.online`, `stream.update`, and `stream.offline`
- Notify validates the webhook and enqueues the event into BullMQ
- Worker resolves the correct messenger provider and sends, edits, or deletes announcements
- Dashboard and Telegram bot both operate on the same PostgreSQL and Redis state

```text
MemeLab Backend
  -> POST /api/webhooks/stream
     -> Express API
        -> BullMQ queue
           -> announcement worker
              -> Telegram provider
              -> MAX provider (implemented, currently disabled)
```

## Repository Layout

```text
.ai/
├── context/
├── decisions/
├── handoffs/
└── tasks/

apps/backend/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── src/
    ├── api/
    │   ├── middleware/
    │   │   ├── auth.ts
    │   │   ├── types.ts
    │   │   ├── validation.ts
    │   │   └── webhookAuth.ts
    │   └── routes/
    │       ├── auth.ts
    │       ├── chats.ts
    │       ├── streamer.ts
    │       └── webhooks.ts
    ├── bot/
    │   ├── commands/
    │   │   ├── channels.ts
    │   │   ├── connect.ts
    │   │   ├── preview.ts
    │   │   ├── settings.ts
    │   │   ├── settingsTemplate.ts
    │   │   ├── start.ts
    │   │   ├── stats.ts
    │   │   └── test.ts
    │   ├── handlers/
    │   │   ├── callbackChannels.ts
    │   │   ├── callbackQuery.ts
    │   │   ├── chatShared.ts
    │   │   └── myChatMember.ts
    │   ├── router.ts
    │   ├── setup.ts
    │   ├── types.ts
    │   └── ui.ts
    ├── lib/
    ├── providers/
    │   ├── max/
    │   ├── telegram/
    │   ├── registry.ts
    │   └── types.ts
    ├── services/
    │   ├── announcementDelivery.ts
    │   ├── announcementOffline.ts
    │   ├── announcementService.ts
    │   ├── resolveProvider.ts
    │   ├── streamerService.ts
    │   └── templateService.ts
    ├── test/
    ├── workers/
    │   └── announcementQueue.ts
    └── index.ts

apps/frontend/
├── src/
│   ├── api/
│   ├── components/
│   │   ├── chat/
│   │   ├── layout/
│   │   └── settings/
│   ├── hooks/
│   ├── lib/
│   ├── pages/
│   │   ├── ChannelsPage.tsx
│   │   ├── Landing.tsx
│   │   └── SettingsPage.tsx
│   ├── styles/
│   ├── types/
│   ├── App.tsx
│   └── main.tsx
└── vite.config.ts
```

## Runtime Components

### Backend API

`apps/backend/src/index.ts` starts:

- Express app
- security middleware (`helmet`, CORS, CSRF check)
- Redis-backed rate limiting
- provider registration
- health endpoint at `/api/health`
- BullMQ worker
- Telegram bot polling or webhook mode

### Frontend

The frontend is a React 19 SPA. It uses:

- `react-router-dom` for routing
- TanStack React Query for server state
- `@memelabui/ui` for UI primitives
- `@sentry/react` for optional error monitoring

Current routes:

- `/`
- `/dashboard/channels`
- `/dashboard/settings`

## Authentication

Authentication relies on the main MemeLab token, not on a local OAuth implementation.

### Request auth flow

1. Frontend sends the MemeLab token cookie or `Authorization: Bearer ...`
2. `requireAuth` extracts the token
3. Notify fetches `GET {MEMELAB_API_URL}/v1/me` when cache is cold
4. Profile is cached in Redis for 5 minutes
5. Streamer record is upserted or loaded from PostgreSQL

### Auth-related routes

```text
GET  /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
POST /api/auth/telegram-link
POST /api/auth/telegram-unlink
POST /api/auth/sync
GET  /api/auth/available-platforms
```

`/api/auth/login` redirects the user to the MemeLab login page with a `returnUrl` back to Notify.

## Data Model

Prisma schema lives in `apps/backend/prisma/schema.prisma`.

### Main models

- `Streamer`
  - links a MemeLab account/channel to Notify
  - stores template defaults, platform URLs, custom buttons, photo type
  - optionally stores encrypted custom Telegram bot token and bot username
  - optionally stores linked Telegram user ID for bot commands
- `ConnectedChat`
  - one streamer can have up to 20 connected chats
  - stores provider, chat identity, per-chat template override, `deleteAfterEnd`
  - tracks the last sent provider message ID
- `AnnouncementLog`
  - stores queued/sent/deleted/failed delivery attempts
  - uses `streamSessionId` to correlate online, update, and offline events

### Important enums

- `MessengerProvider`: `telegram`, `max`
- `PhotoType`: `stream_preview`, `game_box_art`, `none`
- `AnnouncementStatus`: `queued`, `sent`, `deleted`, `failed`

## Provider Model

All messenger integrations implement the shared interface from `apps/backend/src/providers/types.ts`.

```typescript
interface MessengerProvider {
  readonly name: string;
  sendAnnouncement(chatId: string, data: AnnouncementData): Promise<{ messageId: string }>;
  editAnnouncement(chatId: string, messageId: string, data: AnnouncementData): Promise<void>;
  deleteMessage(chatId: string, messageId: string): Promise<void>;
  getChatInfo(chatId: string): Promise<ChatInfo>;
  validateBotAccess(chatId: string): Promise<boolean>;
}
```

### Current providers

- `TelegramProvider`
  - active
  - uses native `fetch` against Telegram Bot API
  - supports global bot token and optional per-streamer custom bot token
- `MaxProvider`
  - implemented
  - currently not registered in normal use until `MAX_BOT_TOKEN` is configured
  - frontend flow for adding MAX chats is intentionally hidden for now

### Provider resolution

`apps/backend/src/services/resolveProvider.ts` selects:

- streamer-specific Telegram bot for announcements when `customBotToken` exists
- otherwise the globally registered provider

Chat linking through `@MemelabNotifyBot` still uses the global Telegram bot.

## API Surface

### Chats

```text
GET    /api/chats
POST   /api/chats
PATCH  /api/chats/:id
DELETE /api/chats/:id
POST   /api/chats/:id/test
```

Notes:

- `POST /api/chats` validates provider support and bot access before insert
- duplicate chats are prevented with a transaction and unique key
- list endpoints use explicit `take` limits

### Streamer settings

```text
GET   /api/streamer/settings
PATCH /api/streamer/settings
```

The settings surface currently includes:

- `streamPlatforms`
- `customButtons`
- `defaultTemplate`
- `photoType`
- `customBotToken`

### Webhook

```text
POST /api/webhooks/stream
Header: X-Webhook-Secret
```

Supported payload events:

- `stream.online`
- `stream.update`
- `stream.offline`

Common fields:

- `channelId`
- `channelSlug`
- `twitchLogin?`
- `streamTitle?`
- `gameName?`
- `thumbnailUrl?`
- `viewerCount?`
- `startedAt?` depending on event type

## Announcement Lifecycle

### Online

1. Webhook is validated
2. Event is added to BullMQ with deterministic `jobId`
3. Worker finds the streamer and enabled chats
4. Template variables and buttons are built
5. Provider sends the message
6. `AnnouncementLog` and `ConnectedChat.lastMessageId` are updated

### Update

1. Worker resolves the active `streamSessionId`
2. Previously sent messages for that session are loaded
3. Provider `editAnnouncement` updates text/photo/buttons in place

### Offline

1. Worker resolves the stored session from Redis
2. Chats with tracked announcement messages are processed
3. Messages are deleted when appropriate
4. `AnnouncementLog` and `lastMessageId` are updated

## Queue

Queue implementation lives in `apps/backend/src/workers/announcementQueue.ts`.

Current settings:

- queue name: `announcements`
- attempts: `3`
- backoff: exponential, `5000ms`
- concurrency: `5`
- limiter: `30` jobs per `1000ms`

The queue is started in the same Node process as the API.

## Telegram Bot

Bot bootstrap lives in `apps/backend/src/bot/setup.ts`.

### Modes

- development: long polling
- production: webhook at `/api/telegram/webhook`

### Supported commands

- `/start`
- `/connect`
- `/channels`
- `/settings`
- `/test`
- `/preview`
- `/stats`
- `/cancel`

### Linking and chat connection flow

1. User opens dashboard and requests Telegram linking
2. Backend generates a one-time deep link via `/api/auth/telegram-link`
3. User starts the bot with `link_<token>`
4. Bot marks the Telegram user as linked to the streamer
5. User sends `/connect`
6. Telegram native chat picker returns `chat_shared`
7. Backend creates the `ConnectedChat` record after bot access checks

## Frontend Architecture

### Data fetching

- auth state comes from `['auth', 'me']`
- chats come from `['chats']`
- streamer settings come from `['streamer', 'settings']`

### Page responsibilities

- `Landing.tsx`: marketing entry + login CTA
- `ChannelsPage.tsx`: Telegram link status, chat list, add-chat modal
- `SettingsPage.tsx`: platforms, buttons, photo type, custom bot

### Current add-chat UX

The dashboard no longer asks the user for raw chat IDs. The flow is:

1. Link Telegram account
2. Open `@MemelabNotifyBot`
3. Run `/connect`
4. Select the chat from the Telegram-native picker

## Security

- `helmet` for base headers
- CORS restricted to configured frontend origin
- CSRF protection for non-webhook state-changing requests via `Origin` / `Referer`
- Redis-backed rate limiting on `/api/`
- shared secret validation for `/api/webhooks/*`
- encrypted custom Telegram bot tokens via AES-256-GCM
- URL validation and host restrictions for user-provided links and thumbnails

## Environment Variables

Backend `.env` keys in active use:

- `PORT`
- `NODE_ENV`
- `PUBLIC_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `MEMELAB_API_URL`
- `WEBHOOK_SECRET`
- `JWT_COOKIE_NAME`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `BOT_TOKEN_ENCRYPTION_KEY`
- `MAX_BOT_TOKEN`
- `SENTRY_DSN`
- `LOG_LEVEL`

Frontend `.env` keys in active use:

- `VITE_API_URL`
- `VITE_SENTRY_DSN`

## Deployment

Deployment is handled by GitHub Actions plus a self-hosted runner.

- workflow: `.github/workflows/ci.yml`
- process manager: PM2 via `ecosystem.config.cjs`
- reverse proxy: Nginx
- health endpoint used in deploy check: `http://127.0.0.1:3003/api/health`

CI currently builds and tests the repo on Node 20.
