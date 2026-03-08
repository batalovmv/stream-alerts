# ADR 0001: Persistent AI collaboration layer

- Status: accepted
- Date: 2026-03-08
- Supersedes: none

## Context

The repository is worked on by at least two assistants, Codex and Opus. Before this change, the project had entry-point instructions but no shared, tracked structure for task records, handoffs, or durable assistant memory. Vendor-local folders such as `.claude/` are not a safe place for shared project knowledge because they are ignored by git.

## Decision

Store durable assistant context in a tracked `.ai/` directory. Use `AGENTS.md` and `CLAUDE.md` as entry guides that point assistants into the same shared workflow. Require non-trivial work to be recorded in `.ai/tasks/`, unfinished work to be recorded in `.ai/handoffs/`, and durable rules or invariants to be recorded in `.ai/decisions/`.

## Consequences

- Future assistants have a consistent place to read and update shared context
- The repository gains a small documentation maintenance cost on non-trivial work
- Knowledge stored only in `.claude/` or chat history is explicitly treated as non-durable
