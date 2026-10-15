# 0009 — Plan-driven development with executable acceptance criteria

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/001-repo-bootstrap.md

## Context

Work will be carried out by a sequence of AI agent sessions with no shared memory beyond the repository. Each session must know exactly what to do, how to prove it is done, and how to leave context for the next session.

## Decision

- Work is organised as numbered plans in `docs/plans/`, each with Context, Scope, Steps, **Acceptance criteria that are commands or tests**, and a Docs checklist.
- A plan's body is frozen once `in-progress`; changes go to a new plan or an ADR.
- Each executed plan gets a journal entry (`docs/journal/`) and updates `docs/STATUS.md`.
- `tools/docs-check.ts` validates the structure (every plan has valid frontmatter, STATUS references existing plans, ADR index matches files).

## Alternatives considered

- **Issue tracker outside the repo** — invisible to agents without integrations; context splits. Rejected for now (can mirror later).
- **One big roadmap doc** — no executable criteria; drifts. Rejected.

## Consequences

- Up-front cost of writing good acceptance criteria. Worth it.
- Status reporting is mechanical: `bun run docs:check` + the plan board.
