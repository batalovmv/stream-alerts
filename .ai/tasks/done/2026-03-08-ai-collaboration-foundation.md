# Task: AI collaboration foundation

- ID: 2026-03-08-ai-collaboration-foundation
- Status: done
- Owner: Codex
- Created: 2026-03-08
- Updated: 2026-03-08
- Related: none

## Goal

Create a durable, shared operating layer for Codex and Opus so future AI work has a consistent place for context, task tracking, decisions, and handoffs.

## Why

The repo already had assistant instructions, but it did not have a tracked operating system for cross-session context. Durable knowledge was at risk of staying in chat history or vendor-local folders.

## Scope

- Add a tracked `.ai/` directory for persistent AI memory
- Define task, decision, and handoff workflows
- Wire the new workflow into `AGENTS.md`, `CLAUDE.md`, and `README.md`

## Constraints

- Reuse the existing project architecture instead of inventing a parallel documentation tree
- Keep Codex and Opus entry files semantically aligned
- Avoid storing durable context in ignored vendor-local folders

## Plan

1. Inspect the current repo structure and AI-related files
2. Create `.ai/` context, task, decision, and handoff templates
3. Update root assistant guides and README to enforce the new workflow

## Files

- `.ai/README.md`
- `.ai/context/project-map.md`
- `.ai/context/current-state.md`
- `.ai/tasks/`
- `.ai/decisions/`
- `.ai/handoffs/`
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`

## Validation

- [x] Verified the current repo structure before writing the new map
- [x] Added a tracked place for durable context, tasks, decisions, and handoffs
- [x] Updated Codex and Opus entry guides to point at the same workflow
- [x] Updated the main README so humans can find the AI layer

## Notes

This was a documentation-and-process change only. No build or test commands were needed to validate runtime behavior.

## Result

The repository now has a shared AI collaboration layer with explicit rules for where future assistants must store durable context and how they should update it after non-trivial tasks.

## Next Steps

- Keep `.ai/context/current-state.md` current when the repo structure or workflow changes
- Add more decision records if the AI workflow grows beyond the initial baseline
