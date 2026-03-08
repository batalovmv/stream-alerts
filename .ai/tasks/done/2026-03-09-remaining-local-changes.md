# Task: Remaining local changes

- ID: 2026-03-09-remaining-local-changes
- Status: done
- Owner: Codex
- Created: 2026-03-09
- Updated: 2026-03-09
- Related: 2026-03-08-project-warning-cleanup

## Goal

Review the leftover uncommitted local changes, confirm that they still make sense after the docs deploy, and land them safely.

## Why

The worktree still contained code, config, and AI task changes that affected lint behavior, test typing, diagnostic script output, and the root frontend test workflow. Leaving them uncommitted would keep the repo and docs out of sync.

## Scope

- Re-review the remaining local changes for relevance and safety
- Validate lint, build, and test with those changes present
- Commit and deploy the leftover package as a separate change

## Constraints

- Do not include unrelated worktree changes beyond the reviewed package
- Keep the AI workflow records up to date
- Use repository validation commands before deploy

## Plan

1. Inspect the leftover diffs and verify what each change does
2. Run `pnpm lint`, `pnpm build`, and `pnpm test`
3. Commit the reviewed package and deploy it through the existing GitHub Actions workflow

## Files

- `apps/backend/src/api/middleware/auth.test.ts`
- `apps/backend/src/scripts/diagnose.ts`
- `apps/backend/src/services/streamerService.test.ts`
- `apps/frontend/package.json`
- `eslint.config.js`
- `.ai/tasks/done/2026-03-08-project-warning-cleanup.md`

## Validation

- [x] `pnpm lint`
- [x] `pnpm build`
- [x] `pnpm test`
- [x] `pnpm ai:check`
- [x] `git diff --check`

## Notes

The changes were still current. In particular, the `apps/frontend/package.json` update is required so the already-documented root `pnpm test` command truly runs frontend tests, and the ESLint config adjustment preserves the production file-size rule while exempting scenario-heavy tests and scripts.

## Result

The leftover local changes were confirmed as valid, committed separately, and prepared for deploy without mixing in unrelated worktree edits.

## Next Steps

- Keep workflow and docs changes in the same commit when future tooling updates change the expected root commands
