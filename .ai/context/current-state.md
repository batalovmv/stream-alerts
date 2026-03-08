# Current State

Updated: 2026-03-09

## Snapshot

- A tracked `.ai/` collaboration layer now exists for Codex and Opus.
- Durable AI context belongs in `.ai/`, `AGENTS.md`, `CLAUDE.md`, and tracked docs.
- `.claude/` exists in the repo but is gitignored and should be treated as local tool state only.
- A root AI CLI now exists at `scripts/ai.js` with `pnpm ai:*` commands for task, handoff, ADR, and check workflows.
- `pnpm ai:check` is a soft reminder and is invoked from `.husky/pre-commit`.
- Root `pnpm test` now runs both backend and frontend Vitest suites because the frontend package exposes a `test` script.
- Root docs (`README.md`, `docs/ARCHITECTURE.md`, `docs/CONCEPT.md`, `AGENTS.md`, `CLAUDE.md`) were refreshed to match the current auth flow, provider contract, bot flow, and platform status.

## Observed Surface In Code

- Backend routes currently include `auth.ts`, `chats.ts`, `streamer.ts`, and `webhooks.ts`.
- Messenger providers currently include Telegram and MAX implementations.
- Announcement logic is split across `announcementService.ts`, `announcementDelivery.ts`, and `announcementOffline.ts`.
- Frontend pages currently center on `Landing.tsx`, `ChannelsPage.tsx`, and `SettingsPage.tsx`.
- Backend and frontend both already contain some tests, but coverage depth is uneven by area.

## Documentation Duties

- Keep `AGENTS.md` and `CLAUDE.md` semantically aligned.
- Update `.ai/context/current-state.md` after meaningful structural or workflow changes.
- Record non-trivial work in `.ai/tasks/`.
- Record durable rules or architectural choices in `.ai/decisions/`.

## Known Risks And Follow-Ups

- `.claude/` is ignored, so knowledge stored only there is invisible to other assistants.
- `pnpm ai:check` intentionally warns softly by default, so it improves compliance but does not fully enforce it yet.
- Docs now reflect the current implementation more closely, but code and tests remain the source of truth when future edits diverge.
