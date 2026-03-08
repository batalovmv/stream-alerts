# Task: Docs audit

- ID: 2026-03-09-docs-audit
- Status: done
- Owner: Codex
- Created: 2026-03-09
- Updated: 2026-03-09
- Related: none

## Goal

Audit the repository documentation and verify whether the developer-facing docs still match the current codebase and workflow.

## Why

Recent work added and changed AI workflow, auth flow, bot commands, provider behavior, and announcement handling. Stale docs would mislead future development sessions.

## Scope

- Review root docs, architecture docs, and assistant entry guides
- Compare documented routes, providers, workflow, and setup steps against current code
- Run core validation commands from the documented workflow

## Constraints

- Do not overwrite unrelated user changes in the worktree
- Treat code and tests as the source of truth when docs disagree

## Plan

1. Read the required `.ai/` context and create a task record
2. Compare the main docs and assistant guides against the current repo state
3. Run build/test checks and summarize documentation gaps

## Files

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/CONCEPT.md`
- `.ai/context/project-map.md`
- `.ai/context/current-state.md`

## Validation

- [x] `pnpm ai:check`
- [x] `pnpm build`
- [x] `pnpm test`

## Notes

The most reliable docs today are the tracked `.ai/context/*` files. The largest drift is in `docs/ARCHITECTURE.md`, followed by developer-facing claims in `AGENTS.md` and `CLAUDE.md`, and product/setup messaging in `README.md` and `docs/CONCEPT.md`.

## Result

Documentation is only partially current. Internal AI context is mostly aligned, but several core docs misdescribe the auth flow, provider interface, webhook contract, bot capabilities, MAX availability, and local-development assumptions.

## Next Steps

- Update `docs/ARCHITECTURE.md` from the current code paths and route surface
- Sync `AGENTS.md` and `CLAUDE.md` with the real provider contract and auth/webhook flow
- Refresh `README.md` and `docs/CONCEPT.md` so feature status and setup steps match the actual product
