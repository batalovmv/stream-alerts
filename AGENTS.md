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

## AI Collaboration Layer

Persistent cross-session AI context lives in the tracked `.ai/` directory.

After reading this file, read in order:
1. `.ai/README.md`
2. `.ai/context/project-map.md`
3. `.ai/context/current-state.md`
4. Relevant files in `.ai/tasks/`, `.ai/decisions/`, or `.ai/handoffs/`

### Required Workflow

- For any non-trivial task, start with `pnpm ai:task:new -- short-slug`
- Prefer the repository AI CLI over manual `.ai/` file creation
- Standard commands: `pnpm ai:task:new -- short-slug`, `pnpm ai:handoff:new -- short-slug --task YYYY-MM-DD-short-slug`, `pnpm ai:adr:new -- short-slug`, `pnpm ai:check`
- When the task is completed, move or rewrite it into `.ai/tasks/done/YYYY-MM-DD-slug.md`
- If work stops unfinished, create or update `.ai/handoffs/YYYY-MM-DD-slug.md`
- Record durable rules, architecture changes, or workflow decisions in `.ai/decisions/`
- Update `.ai/context/current-state.md` when the repo's working reality changes
- Never treat `.claude/`, chat history, or local tool settings as durable project memory

---

## Project Overview

**MemeLab Notify** sends automatic stream announcements to Telegram channels and MAX groups when a streamer goes live. It's a standalone service that integrates with the main MemeLab backend via webhooks.

```
memelab-notify/
├── .ai/                # Shared AI context, tasks, decisions, handoffs
├── apps/
│   ├── backend/          # Express API, Telegram/MAX bots, BullMQ workers
│   └── frontend/         # React SPA dashboard
├── docs/                 # Project documentation
├── AGENTS.md             # Codex entry guide (YOU ARE HERE)
├── CLAUDE.md             # Opus entry guide
└── README.md
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Runtime** | Node.js (ESM) | 20+ |
| **Package manager** | pnpm (workspace) | 9+ |
| **Backend framework** | Express | 4.x |
| **Database** | PostgreSQL + Prisma ORM | 6.x |
| **Queue** | BullMQ + Redis (ioredis) | 5.x |
| **Validation** | Zod | 3.x |
| **Logging** | Pino + pino-pretty | 9.x |
| **Monitoring** | Sentry (@sentry/node, @sentry/react) | 10.x |
| **Frontend** | React 19 + TypeScript | 19.x |
| **Routing** | react-router-dom | 7.x |
| **Server state** | TanStack React Query | 5.x |
| **UI kit** | @memelabui/ui + Tailwind CSS | 3.4.x |
| **Build (frontend)** | Vite | 6.x |
| **Build (backend)** | tsc (TypeScript) | 5.7+ |
| **Tests** | Vitest + @testing-library/react | 3.x |
| **Linting** | ESLint + Prettier | 9.x |
| **Git hooks** | Husky + lint-staged + commitlint | — |

---

## Architecture Principles

1. **Provider-agnostic**: All messenger integrations implement a common `MessengerProvider` interface
2. **Async delivery**: Announcements go through BullMQ queue (never block webhook handlers)
3. **Telegram-first management**: Chat linking and bot UX go through the global `@MemelabNotifyBot`, while announcement delivery may use an optional per-streamer custom Telegram bot
4. **MemeLab token auth**: Authentication relies on the main MemeLab platform token/profile flow, not a local OAuth callback implementation
5. **Webhook-driven**: Stream events come from MemeLab backend via webhooks

### Layer Rules

| Layer | Location | Allowed dependencies |
|-------|----------|---------------------|
| **Routes** | `src/api/routes/` | Services, middleware, Prisma, Zod schemas |
| **Middleware** | `src/api/middleware/` | Prisma, Redis, config — NO services |
| **Services** | `src/services/` | Prisma, Redis, providers, lib/ — NO routes |
| **Providers** | `src/providers/` | External APIs only — NO Prisma, NO services |
| **Workers** | `src/workers/` | Services, Prisma, Redis — NO routes |
| **Lib** | `src/lib/` | Pure utilities — NO services, NO routes |

**Rule**: Never import upward. Workers/Routes → Services → Providers/Lib. Never Services → Routes.

---

## State Management

### Backend
- No global state. All state lives in PostgreSQL (Prisma) and Redis.
- BullMQ handles async job state.

### Frontend
- **Server state**: TanStack React Query (`useQuery` / `useMutation`) — all API data goes through query cache
- **Auth state**: Derived from `['auth', 'me']` query — no separate auth context/store
- **Local state**: `useState` for component-level UI state only
- **No global client state store** (no Redux, Zustand, Jotai, Context for state)

**Rule**: Never add a global state library. If you need shared state, it's either server state (React Query) or should be lifted to a parent component.

---

## Available Tools

### GitHub CLI
- **gh CLI** is installed and authorized
- Use for: PRs, issues, releases

### Common Commands

```bash
# AI workflow
pnpm ai:task:new -- short-slug
pnpm ai:handoff:new -- short-slug --task YYYY-MM-DD-short-slug
pnpm ai:adr:new -- short-slug
pnpm ai:check

# Install dependencies
pnpm install

# Development
pnpm dev              # All apps
pnpm dev:backend      # Backend only
pnpm dev:frontend     # Frontend only

# Build
pnpm build

# Lint & format
pnpm lint             # ESLint check
pnpm lint:fix         # ESLint auto-fix
pnpm format           # Prettier format

# Database
cd apps/backend
npx prisma migrate dev
npx prisma generate
npx prisma studio

# Tests
pnpm test
```

---

## API Contract

### Success Response

```json
{ "chat": { "id": "uuid", "provider": "telegram", ... } }
```

Top-level key is the resource name (`chat`, `chats`, `user`, etc.) or `{ "ok": true }` for actions without return data.

### Error Response (standard envelope)

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Human-readable description",
    "details": { "field": ["specific error"] }
  }
}
```

Error codes: `VALIDATION_FAILED`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, `BAD_GATEWAY`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`, `BOT_ACCESS_DENIED`, `PROVIDER_ERROR`, `LIMIT_EXCEEDED`.

Use `AppError` class from `src/lib/errors.ts`:
```typescript
throw AppError.notFound('Streamer');
throw AppError.conflict('Chat already connected');
throw AppError.badRequest('Invalid provider', { field: ['must be telegram or max'] });
```

### HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Success (GET, PATCH, DELETE) |
| 201 | Created (POST) |
| 400 | Validation / bad input |
| 401 | Not authenticated |
| 403 | CSRF / forbidden |
| 404 | Resource not found |
| 409 | Conflict (duplicate) |
| 429 | Rate limited |
| 502 | Upstream service error |
| 503 | Health check degraded |

### No Pagination

This service has no paginated endpoints. All lists are bounded by business rules (max 20 chats per streamer). Use `take: 100` as a safety cap on `findMany`.

---

## Database Migrations

**CRITICAL: Always review migration SQL before committing.**

When running `prisma migrate dev`, Prisma may generate a full-schema migration (CREATE TABLE/ENUM for everything) instead of an incremental one if the local environment lacks migration history. This **will break production** where tables already exist.

Before committing any migration:
1. Read the generated `.sql` file — it must contain only `ALTER TABLE`, `CREATE INDEX`, `DROP` statements for the specific change
2. If you see `CREATE TABLE` or `CREATE TYPE` for existing models — **delete the migration** and write the SQL manually
3. Use `IF NOT EXISTS` / `IF EXISTS` guards for safety
4. Test with `pnpm build` to verify Prisma client generates correctly

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/backend/prisma/schema.prisma` | Database schema |
| `apps/backend/src/lib/errors.ts` | Error catalog (AppError class + codes) |
| `apps/backend/src/lib/types.ts` | Shared types (MemelabUserProfile, AuthStreamer, AuthenticatedRequest) |
| `apps/backend/src/lib/urlValidation.ts` | URL validation utility (isValidUrl — SSRF protection) |
| `apps/backend/src/providers/` | Messenger provider implementations |
| `apps/backend/src/services/resolveProvider.ts` | Provider resolution (custom bot token, hasProvider, validateBotToken) |
| `apps/backend/src/api/` | REST API endpoints |
| `apps/backend/src/bot/` | Telegram bot command handlers |
| `apps/backend/src/workers/` | BullMQ workers |
| `apps/backend/src/test/factories.ts` | Shared test factories |
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
  editAnnouncement(chatId, messageId, data): Promise<void>;
  deleteMessage(chatId, messageId): Promise<void>;
  getChatInfo(chatId): Promise<ChatInfo>;
  validateBotAccess(chatId): Promise<boolean>;
}
```

Adding a new messenger = new provider file, no changes to core logic.

Current providers:
- `TelegramProvider` — Telegram Bot API via native fetch
- `MaxProvider` — MAX Bot API via @maxhub/max-bot-api (implemented but intentionally disabled until `MAX_BOT_TOKEN` and platform access are available)

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

### Import Order (enforced by ESLint)
1. Node built-ins (`node:*`)
2. External packages (`express`, `zod`, `react`)
3. Internal modules (`../lib/`, `../services/`)
4. Parent imports (`../`)
5. Sibling imports (`./`)

Blank line between groups. Alphabetical within groups.

### File Size Limits
- **Max 300 lines per production source file** (excluding blank lines and comments). Split if larger.
- **Scenario-heavy test files may exceed this** when splitting would hurt readability, but prefer shared setup/helpers before allowing growth.
- Routes: one file per resource (`chats.ts`, `streamer.ts`, `auth.ts`)
- Services: one file per domain concern

### Commits
```
feat: add feature X
fix: fix bug Y
refactor: refactor module Z
docs: update documentation
```

Enforced by commitlint. Husky pre-commit runs `lint-staged` (ESLint + Prettier on staged files).

---

## Code Templates

### New API Endpoint

```typescript
// apps/backend/src/api/routes/example.ts
import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/types.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

export const exampleRouter = Router();

exampleRouter.use(requireAuth);

// GET /api/example
exampleRouter.get('/', async (req, res: Response) => {
  const { streamer } = req as AuthenticatedRequest;
  const items = await prisma.example.findMany({
    where: { streamerId: streamer.id },
    take: 100,
  });
  res.json({ items });
});

// POST /api/example
exampleRouter.post('/', validate(createSchema), async (req, res: Response) => {
  const { streamer } = req as AuthenticatedRequest;
  try {
    const item = await prisma.example.create({ data: { ...req.body, streamerId: streamer.id } });
    res.status(201).json({ item });
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, 'example.create_failed');
    throw AppError.internal();
  }
});
```

### New React Page

```tsx
// apps/frontend/src/pages/ExamplePage.tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

interface Example { id: string; name: string; }

export function ExamplePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['examples'],
    queryFn: () => api.get<{ items: Example[] }>('/api/example'),
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading data</div>;

  return (
    <div>
      {data?.items.map((item) => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
}
```

---

## Testing Rules

### What to Test
- **Always test**: Services (business logic), API routes (request/response), middleware, utility functions
- **Don't test**: Prisma schema, config loading, type definitions, trivial getters

### How to Test
- **Framework**: Vitest with `vi.mock()` for dependency injection
- **Factories**: Use shared factories from `src/test/factories.ts` — never duplicate mock objects inline
- **Naming**: `<module>.test.ts` co-located next to source file
- **Structure**: `describe('moduleName')` → `it('should ...')` with AAA (Arrange/Act/Assert)
- **Backend ESM**: Mock imports use `.js` extensions (`vi.mock('../lib/prisma.js')`)

### Coverage Targets
- Backend: **70% lines, 70% functions** (enforced by vitest.config.ts)
- Frontend: not enforced yet — aim for critical paths (API client, error boundaries)

### Running Tests
```bash
pnpm test                   # All tests
pnpm --filter backend test  # Backend only
```

### Test Factories

```typescript
import { makeStreamer, makeChat, makeFakeProvider, createMockReqRes } from '../test/factories.js';

const streamer = makeStreamer({ displayName: 'Custom' });
const chat = makeChat({ provider: 'max' });
const provider = makeFakeProvider();
const { req, res, next } = createMockReqRes({ streamer });
```

---

## Git Workflow

- **`main`** = production branch, deployed automatically via GitHub Actions
- Create **feature branches** for non-trivial changes: `feat/add-discord-provider`, `fix/dedup-race`
- **Squash merge** PRs into main
- Direct commits to `main` only for hotfixes and docs

### Pre-commit Checks (Husky)
1. `lint-staged`: ESLint --fix + Prettier on staged `.ts`/`.tsx` files
2. `commitlint`: Validates conventional commit format

### Pre-push: Run `pnpm build && pnpm test` before pushing

---

## Guard Rails

### Before Creating New Code
- **Search first**: `Grep` for existing implementations before creating new utils/helpers/components. Duplication is the #1 source of bugs.
- **Check the template**: Use the Code Templates section above for new endpoints/pages.
- **Read before modify**: Never edit a file you haven't read. Understand the context.

### Security Rules
- **Validate all input** at API boundaries using Zod schemas via `validate()` middleware
- **Sanitize URLs**: Use `isValidUrl()` from `lib/urlValidation.ts` for user-provided URLs
- **No raw SQL**: Always use Prisma — never `prisma.$queryRawUnsafe` with user input
- **CORS**: Only allow origins from `config.allowedOrigins` — never `*`
- **Rate limiting**: All `/api/` routes are rate-limited via Redis-backed middleware
- **Webhook auth**: `X-Webhook-Secret` HMAC validation on all webhook endpoints
- **Cookie security**: `httpOnly`, `secure`, `sameSite: 'lax'` on auth cookies
- **Bot tokens**: Encrypted at rest via `lib/encryption.ts` — never log or expose in API responses
- **`take` limits**: Always use `take` on `findMany` queries to prevent unbounded results

### What NOT to Do
- Never add `"type": "commonjs"` — the project is ESM-only
- Never use `axios` — use native `fetch`
- Never add global state libraries (Redux, Zustand) to the frontend
- Never commit `.env` files or secrets
- Never skip Zod validation on POST/PATCH endpoints
- Never use `any` without a `// eslint-disable-next-line` comment explaining why

---

## Shared Code Protocol

Backend and frontend share no code package. If API types change:
1. Update the Zod schema in backend
2. Update the corresponding TypeScript interface in frontend manually
3. Verify both sides with `pnpm build`

---

## Integration with MemeLab

### Webhook from MemeLab Backend
```
POST /api/webhooks/stream
Headers: X-Webhook-Secret: <shared_secret>
Body: {
  event: 'stream.online' | 'stream.update' | 'stream.offline',
  channelId, channelSlug, twitchLogin,
  streamTitle?, gameName?, thumbnailUrl?, viewerCount?, startedAt?
}
```

### Auth via MemeLab
- Frontend enters through `GET /api/auth/login`, which redirects to the main MemeLab login page with a return URL back to Notify
- Requests are authenticated with the MemeLab token from the cookie named by `JWT_COOKIE_NAME` or from `Authorization: Bearer ...`
- Notify fetches `GET {MEMELAB_API_URL}/v1/me`, caches the profile in Redis, and upserts the local `Streamer`
- Telegram account linking is handled separately through `POST /api/auth/telegram-link` and the bot deep-link flow

---

## Documentation

- [Product Concept](docs/CONCEPT.md)
- [Architecture](docs/ARCHITECTURE.md)

---

## Maintenance

- **Keep the AI layer updated**: When adding new patterns, routes, or architectural decisions, update `.ai/` in the same commit.
- **Keep entry guides aligned**: `AGENTS.md` and `CLAUDE.md` must stay semantically synchronized.
- **Keep this file updated**: If Codex-specific workflow expectations change, update `AGENTS.md` in the same commit.
- **Review quarterly**: Check that tech stack versions, file paths, and rules match reality.

---

*Last updated: 2026-03-08*
