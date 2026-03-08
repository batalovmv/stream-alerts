# Current State

Updated: 2026-03-08

## Snapshot

- A tracked `.ai/` collaboration layer now exists for Codex and Opus.
- Durable AI context belongs in `.ai/`, `AGENTS.md`, `CLAUDE.md`, and tracked docs.
- `.claude/` exists in the repo but is gitignored and should be treated as local tool state only.

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
- The root `pnpm test` flow should be verified before relying on it for frontend coverage, because `apps/frontend/package.json` currently does not define an explicit `test` script.
- Some project docs describe target architecture at a higher level than the current implementation, so assistants should verify code paths before editing adjacent files.
