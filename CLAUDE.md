# AI Assistant Guide

> This document contains everything AI assistants need to work on MemeLab Notify.
>
> **READ FULLY before starting work.**

---

## Quick Start

1. **Project**: MemeLab Notify — stream announcement service for Telegram/MAX
2. **Repo**: github.com/batalovmv/stream-alerts
3. **Domain**: notify.memelab.ru
4. **Style**: Dark theme matching neiro-api.memelab.ru
5. **Related**: Main project at github.com/batalovmv/memalerts-monorepo

---

## Project Overview

**MemeLab Notify** sends automatic stream announcements to Telegram channels and MAX groups when a streamer goes live. It's a standalone service that integrates with the main MemeLab backend via webhooks.

```
memelab-notify/
├── apps/
│   ├── backend/          # Express API, Telegram/MAX bots, BullMQ workers
│   └── frontend/         # React SPA dashboard
├── docs/                 # Project documentation
├── CLAUDE.md             # YOU ARE HERE
└── README.md
```

---

## Architecture Principles

1. **Provider-agnostic**: All messenger integrations implement a common `MessengerProvider` interface
2. **Async delivery**: Announcements go through BullMQ queue (never block webhook handlers)
3. **One global bot**: Single @MemelabNotifyBot for Telegram, single bot for MAX
4. **MemeLab OAuth**: Authentication through main MemeLab platform
5. **Webhook-driven**: Stream events come from MemeLab backend via webhooks

---

## Available Tools

### GitHub CLI
- **gh CLI** is installed and authorized
- Use for: PRs, issues, releases

### Common Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev              # All apps
pnpm dev:backend      # Backend only
pnpm dev:frontend     # Frontend only

# Build
pnpm build

# Database
cd apps/backend
npx prisma migrate dev
npx prisma generate
npx prisma studio

# Tests
pnpm test
```

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/backend/prisma/schema.prisma` | Database schema |
| `apps/backend/src/providers/` | Messenger provider implementations |
| `apps/backend/src/api/` | REST API endpoints |
| `apps/backend/src/bot/` | Telegram bot command handlers |
| `apps/backend/src/workers/` | BullMQ workers |
| `apps/frontend/src/` | React dashboard |
| `docs/CONCEPT.md` | Product concept |
| `docs/ARCHITECTURE.md` | Technical architecture |

---

## Messenger Providers

All providers implement the `MessengerProvider` interface:

```typescript
interface MessengerProvider {
  name: string;
  sendAnnouncement(chatId, data): Promise<{ messageId: string }>;
  deleteMessage(chatId, messageId): Promise<void>;
  getChatInfo(chatId): Promise<ChatInfo>;
  validateBotAccess(chatId): Promise<boolean>;
}
```

Adding a new messenger = new provider file, no changes to core logic.

Current providers:
- `TelegramProvider` — Telegram Bot API via native fetch
- `MaxProvider` — MAX Bot API via @maxhub/max-bot-api (planned)

---

## Code Style

### TypeScript
- Strict mode enabled
- Prefer `interface` for objects, `type` for unions
- No `any` without comment

### Naming
- Files: `camelCase.ts` for modules, `PascalCase.tsx` for React components
- Variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Types/interfaces: `PascalCase`

### Commits
```
feat: add feature X
fix: fix bug Y
refactor: refactor module Z
docs: update documentation
```

---

## Integration with MemeLab

### Webhook from MemeLab Backend
```
POST /api/webhooks/stream
Headers: X-Webhook-Secret: <shared_secret>
Body: {
  event: 'stream.online' | 'stream.offline',
  channelId, channelSlug, twitchLogin,
  streamTitle?, gameName?, thumbnailUrl?, startedAt?
}
```

### OAuth via MemeLab
- Redirect to memelab.ru/oauth/authorize
- Callback with access_token
- Use token to fetch streamer data

---

## Documentation

- [Product Concept](docs/CONCEPT.md)
- [Architecture](docs/ARCHITECTURE.md)

---

*Last updated: 2026-02-16*
