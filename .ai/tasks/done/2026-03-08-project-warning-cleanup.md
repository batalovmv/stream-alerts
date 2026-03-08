# Task: Project warning cleanup

- ID: 2026-03-08-project-warning-cleanup
- Status: done
- Owner: Codex
- Created: 2026-03-08
- Updated: 2026-03-08
- Related: none

## Goal

Remove project warnings and adjacent workflow issues without destabilizing the codebase.

## Why

The repo had a clean build and passing tests, but lint still reported warnings in large test files, type gaps in tests, and the diagnostic script. The root test workflow also did not actually run frontend tests because the frontend package lacked a `test` script.

## Scope

- Eliminate current lint warnings
- Fix the root frontend test command gap
- Remove small type and script hygiene issues discovered along the way

## Constraints

- Prefer low-risk fixes over broad refactors
- Keep runtime behavior unchanged unless a workflow bug is being corrected
- Update shared AI/docs state when repository-wide rules change

## Plan

1. Run lint, build, and test to capture the real signal set
2. Fix direct code issues and adjust lint policy where the rule did not fit the intended file category
3. Re-run the full verification suite and close the task

## Files

- `eslint.config.js`
- `apps/backend/src/api/middleware/auth.test.ts`
- `apps/backend/src/services/streamerService.test.ts`
- `apps/backend/src/scripts/diagnose.ts`
- `apps/frontend/package.json`
- `.ai/context/current-state.md`
- `AGENTS.md`
- `CLAUDE.md`

## Validation

- [x] `pnpm lint`
- [x] `pnpm build`
- [x] `pnpm test`

## Notes

The large warning surface mostly came from rule fit, not broken behavior. Test files are now exempt from the `max-lines` warning, while production source files still keep the 300-line limit. The diagnostic script keeps stdout-based output without tripping `no-console`, and root frontend tests now execute properly.

## Result

The project is now warning-free under the current lint setup, build passes, backend and frontend tests run from the root, and a few low-signal type/script issues were cleaned up without risky refactors.

## Next Steps

- If large test files become hard to maintain, split them by behavior rather than by line count alone
