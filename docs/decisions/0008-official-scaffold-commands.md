# 0008 — Official scaffold commands only; verify tools against the internet

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/001-repo-bootstrap.md

## Context

Hand-written config files drift from what tools expect, and agents' memory of CLI flags and package versions is frequently out of date. Both produce subtle, time-consuming breakage.

## Decision

1. Any file that a tool's official init/create/add command generates is produced by running that command (`bun init`, `sv create`, `sv add`, future `rapier`/`three` helpers, etc.), then edited. Never hand-written from memory.
2. Before using a tool, CLI flag, API, or package version, the agent reads the official documentation online and records the finding (what, where, date) in `docs/research/stack-versions.md` or a topic file under `docs/research/`.
3. The exact scaffold commands used are recorded in the plan's journal entry so they can be re-run.

## Alternatives considered

- **Trust memory, fix when broken** — cheaper per step, expensive in aggregate. Rejected.

## Consequences

- Plans that add a package or tool include a "verify docs" step.
- `docs/research/` grows; prune entries older than the tool's major version when updating.
