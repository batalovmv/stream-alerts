# AI Collaboration Layer

This directory is the shared, git-tracked memory for Codex and Opus.

Vendor-specific local folders such as `.claude/`, desktop chat history, and temporary shell state are not durable project memory. Anything future assistants must know belongs in `.ai/`.

## Read Order

1. `AGENTS.md` for Codex sessions or `CLAUDE.md` for Opus sessions
2. `.ai/README.md`
3. `.ai/context/project-map.md`
4. `.ai/context/current-state.md`
5. Relevant task, decision, or handoff files
6. The code being changed

## Directory Layout

- `context/` - stable project context and the latest working snapshot
- `tasks/backlog.md` - accepted work that is not started yet
- `tasks/active/` - non-trivial work currently in progress
- `tasks/done/` - completed task records
- `tasks/templates/` - reusable task template
- `decisions/` - ADR-style notes for persistent technical or workflow decisions
- `handoffs/` - unfinished work, blockers, and restart notes

## When To Create A Task File

Create or update a task file for work that is any of the following:

- touches multiple files
- changes architecture, contracts, migrations, or deployment behavior
- involves external integrations
- is likely to span more than one focused session
- should be visible to the next assistant without reading the whole diff

Small typo fixes or isolated text edits can skip a task file.

## Task Lifecycle

1. Create or update `.ai/tasks/active/YYYY-MM-DD-slug.md`
2. Keep the plan, touched files, notes, and validation current while working
3. When finished, record the result and move or rewrite the final state into `.ai/tasks/done/YYYY-MM-DD-slug.md`
4. If blocked or paused, create or update `.ai/handoffs/YYYY-MM-DD-slug.md`

## Update Rules

- Update `.ai/context/current-state.md` when the repo's current working reality changes
- Add a file in `.ai/decisions/` when a new rule, invariant, or durable technical decision should guide future work
- Update `docs/ARCHITECTURE.md` when structural facts change
- Update `docs/CONCEPT.md` when product scope or priorities change
- Update both `AGENTS.md` and `CLAUDE.md` when the AI workflow changes

## Writing Rules

- Keep persistent AI docs in English for maximum model compatibility
- Keep entries factual, short, and easy to scan
- Prefer file paths and summaries over large copied code blocks
- Never write secrets, tokens, or private credentials into `.ai/`
- Use `.ai/local/`, `.ai/tmp/`, or `.ai/scratch/` only for ephemeral local notes; those paths are gitignored and are not shared project memory
