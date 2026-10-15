---
id: 001
title: Repo bootstrap
status: done
owner: "bootstrap session (Claude, 2026-10-16)"
depends: []
phase: 0
created: 2026-10-16
updated: 2026-10-16
---

# 001 — Repo bootstrap

## Goal

An empty GitHub repository becomes a working Bun workspace monorepo with the package skeleton, a building SvelteKit client, passing tests and typechecks, and the complete docs system (spec, architecture, ADRs, plans, journal, research, conventions) so that the next agent can take plan 002 with no other context.

## Context

- ADRs 0001–0009 (all written in this plan).
- `docs/architecture/overview.md`, `boundaries.md`.

## Scope

**In:** scaffolding via official commands, workspace wiring, placeholder package entrypoints, docs system, docs-check tool.
**Out:** any game logic. Everything substantive starts at plan 002.

## Design notes

See ADR 0002 (monorepo), 0006 (SvelteKit static), 0008 (official scaffolds).

## Steps

1. Verify current official commands/versions online (Bun init & workspaces & catalogs, `sv create`/`sv add`, adapter-static, npm versions of Rapier/Three/zod/vitest/TS). Record in `docs/research/stack-versions.md`.
2. `bun init --yes` at root; convert to workspace root (`workspaces.packages`, `catalog`, scripts).
3. `bunx sv@1.1.1 create apps/web --template minimal --types ts --add prettier vitest="usages:unit" sveltekit-adapter="adapter:static" --no-install --no-download-check`; then set `fallback: '200.html'`, `prerender = true`, workspace deps, catalog versions.
4. `bun init --yes` in each of `packages/{core,kepler,physics,sim,sdk,renderer}` and `mods/stock`; patch manifests (name, exports, scripts, deps) and tsconfigs (extend base; `lib` without DOM except renderer).
5. Placeholder `src/index.ts` per package establishing the dependency graph; one smoke test in `core`.
6. Docs system: `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/**`.
7. `tools/docs-check.ts` validating plan frontmatter, STATUS board, ADR index.
8. Verify: `bun install`, `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check`.

## Acceptance criteria

- [x] `bun install` succeeds from a clean clone.
- [x] `bun test` passes (`packages/core/test/smoke.test.ts`).
- [x] `bun run typecheck` passes for all packages and `apps/web`.
- [x] `bun run build` produces `apps/web/build/index.html` and `200.html`.
- [x] `bun run docs:check` passes.
- [x] Every package `tsconfig.json` except `renderer` and `apps/web` has `lib: ["ESNext"]` (no DOM).
- [x] `docs/decisions/README.md` index lists ADRs 0001–0009 and each file exists.

## Docs checklist

- [x] `docs/STATUS.md`
- [x] `docs/journal/001-repo-bootstrap.md`
- [x] `docs/architecture/*` (initial)
- [x] ADRs 0001–0009
- [x] `docs/research/stack-versions.md`

## Log

- 2026-10-16 — Done in one session. `bun init -y` (short flag) misbehaved in the sandbox when `BUN_OPTIONS=--smol` was set in the environment; `--yes` with the env var unset worked. Recorded in the journal.
