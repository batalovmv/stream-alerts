# Project Map

Last reviewed: 2026-03-08

## Product

MemeLab Notify is a standalone service that sends automatic stream announcements to Telegram channels and MAX groups when a streamer goes live.

## Repository Shape

- `apps/backend/` - Express API, bot handlers, providers, queue workers, Prisma schema
- `apps/frontend/` - React 19 dashboard built with Vite
- `docs/` - product and architecture documentation
- `.ai/` - persistent AI collaboration layer for Codex and Opus

## Primary Entry Points

- Backend app entry: `apps/backend/src/index.ts`
- Frontend app entry: `apps/frontend/src/main.tsx`
- Frontend routing shell: `apps/frontend/src/App.tsx`
- Database schema: `apps/backend/prisma/schema.prisma`

## Backend Hotspots

- API routes: `apps/backend/src/api/routes/`
- Middleware: `apps/backend/src/api/middleware/`
- Business logic: `apps/backend/src/services/`
- Providers: `apps/backend/src/providers/`
- Bot handlers: `apps/backend/src/bot/`
- Queue and async processing: `apps/backend/src/queues/`, `apps/backend/src/workers/`
- Shared libraries: `apps/backend/src/lib/`

## Frontend Hotspots

- API client: `apps/frontend/src/api/client.ts`
- Server-state hooks: `apps/frontend/src/hooks/`
- Pages: `apps/frontend/src/pages/`
- Shared UI and page building blocks: `apps/frontend/src/components/`
- Shared frontend types: `apps/frontend/src/types/`
- Styles: `apps/frontend/src/styles/`

## Common Commands

```bash
pnpm install
pnpm dev
pnpm dev:backend
pnpm dev:frontend
pnpm build
pnpm lint
pnpm test
```

Backend-specific:

```bash
pnpm --filter @memelab-notify/backend build
pnpm --filter @memelab-notify/backend test
cd apps/backend
npx prisma migrate dev
npx prisma generate
```

## Non-Negotiable Constraints

- ESM only
- Provider-agnostic messenger integration
- Async announcement delivery via BullMQ
- No global frontend state library
- Validate API input with Zod
- Use Prisma instead of raw unsafe SQL
- Use native `fetch`, not `axios`
- Use `take` limits on `findMany`
- Review generated migration SQL before committing it

## Source Of Truth Hierarchy

1. Code and tests
2. `AGENTS.md` and `CLAUDE.md`
3. `.ai/context/`
4. `docs/ARCHITECTURE.md` and `docs/CONCEPT.md`

When docs and code disagree, verify the code first and then fix the docs in the same task.
