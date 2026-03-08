# Task: AI CLI automation

- ID: 2026-03-08-ai-cli-automation
- Status: done
- Owner: Codex
- Created: 2026-03-08
- Updated: 2026-03-08
- Related: ADR 0002

## Goal

Add a minimal repository CLI that helps Codex and Opus create shared AI records consistently and warns when non-trivial code changes are missing `.ai/` updates.

## Why

The repository already has a tracked `.ai/` layer, but creating and maintaining its files was still manual. Small automation increases compliance without adding high workflow risk.

## Scope

- Add root scripts for task, handoff, and ADR creation
- Add a soft `ai:check` command
- Update the AI workflow docs to use the CLI as the standard path

## Constraints

- Keep the tool dependency-free and ESM-compatible
- Avoid hard-blocking development with overly strict checks
- Preserve the existing `.ai/` structure and templates

## Plan

1. Build a small root Node CLI for `.ai/` automation
2. Wire it into `package.json` and document the standard commands
3. Validate the commands locally and record the new workflow

## Files

- `scripts/ai.js`
- `package.json`
- `.husky/pre-commit`
- `.ai/README.md`
- `.ai/context/current-state.md`
- `.ai/tasks/README.md`
- `.ai/decisions/0002-ai-cli-first-workflow.md`
- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/ARCHITECTURE.md`

## Validation

- [x] `pnpm ai:task:new -- ai-cli-smoke-test --dry-run`
- [x] `pnpm ai:handoff:new -- ai-cli-smoke-test --task 2026-03-08-ai-cli-automation --dry-run`
- [x] `pnpm ai:adr:new -- ai-cli-smoke-test --dry-run`
- [x] `pnpm ai:adr:new -- ai-cli-first-workflow --status accepted`
- [x] `pnpm ai:check`
- [x] `pnpm ai:check -- --strict`
- [x] `git diff --check`

## Notes

`ai:check` is intentionally soft by default and only becomes blocking when called with `--strict`. The pre-commit hook uses the soft mode as a reminder rather than enforcement.

## Result

A root AI CLI now creates task, handoff, and ADR files, and a soft repository check reminds contributors to update `.ai/` during non-trivial work. The workflow is documented in the root assistant guides and in the shared `.ai/` layer.

## Next Steps

- Consider adding CI-only strict enforcement later if the soft reminder proves useful
