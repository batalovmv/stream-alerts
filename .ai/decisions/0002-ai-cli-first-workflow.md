# ADR 0002: AI CLI First Workflow

- Status: accepted
- Date: 2026-03-08
- Supersedes: none

## Context

The repository already has a tracked `.ai/` collaboration layer, but manual file creation still leaves room for inconsistency and skipped updates. Codex and Opus need the lowest-friction path to create shared task, handoff, and decision records. The project also needs a gentle reminder when significant changes happen without matching `.ai/` updates.

## Decision

Use the repository AI CLI in `scripts/ai.js` as the standard way to create new task, handoff, and ADR records. Expose it through root `pnpm` commands and run `pnpm ai:check` as a soft reminder from `.husky/pre-commit`. Keep `ai:check` non-blocking by default, with an optional strict mode for future CI enforcement.

## Consequences

- Codex and Opus have a faster, more consistent way to maintain shared `.ai/` records
- The pre-commit reminder improves compliance without immediately blocking work
- Strong enforcement is deferred, so the workflow still depends on instructions plus soft checks rather than hard guarantees
