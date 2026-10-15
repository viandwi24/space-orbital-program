# Project status

> Living document. Updated at the end of every plan. Keep it short; details go in plans, ADRs and the journal.

**Last updated:** 2026-10-16
**Phase:** 0 — Foundation
**Current plan:** none in progress
**Next plan:** [`plans/002-kepler-orbital-mechanics.md`](plans/002-kepler-orbital-mechanics.md) (`ready`)

## Plan board

| # | Plan | Status | Owner | Notes |
|---|---|---|---|---|
| 001 | [Repo bootstrap](plans/001-repo-bootstrap.md) | done | bootstrap session | scaffold, workspaces, docs system |
| 002 | [Kepler orbital mechanics](plans/002-kepler-orbital-mechanics.md) | ready | — | no deps on other plans |
| 003 | [Core: world, registries, events](plans/003-core-world-registries-events.md) | ready | — | can run in parallel with 002 |
| 004 | [Physics backend + Rapier adapter](plans/004-physics-backend-rapier.md) | draft | — | needs 003 |
| 005 | [SDK define-API + plugin loader](plans/005-sdk-define-api-plugin-loader.md) | draft | — | needs 003 |
| 006 | [Stock mod, minimal](plans/006-stock-mod-minimal.md) | draft | — | needs 005 |
| 007 | [Sim loop: flight + on-rails](plans/007-sim-loop-flight-onrails.md) | draft | — | needs 002, 004, 006 |
| 008 | [Renderer: floating origin](plans/008-renderer-floating-origin.md) | draft | — | needs 003 |
| 009 | [Web client MVP: build, launch, orbit](plans/009-web-client-mvp.md) | draft | — | needs 007, 008 |
| 010 | [Scripting sandbox](plans/010-scripting-sandbox.md) | draft | — | after MVP |

Statuses: `draft` (needs refinement before an agent takes it) · `ready` · `in-progress` · `done` · `blocked`.

## Phases

- **Phase 0 — Foundation** (plans 001–006): repo, math, core runtime, physics adapter, SDK, stock content. Everything headless; passes in Bun with no browser.
- **Phase 1 — MVP** (plans 007–009): a rocket built from stock parts launches from a spherical home planet, stages, reaches a stable orbit, and the orbit is drawn in a map view. Runs in the browser.
- **Phase 2 — Mod ecosystem** (010+): scripting sandbox, external mod loading, mod patching, save/load.
- **Phase 3 — World**: terrain LOD, more bodies, atmosphere model, re-entry heating.

## Known issues / open questions

- Package scope `@orbital/*` is a placeholder; rename before any publish (ADR needed).
- License undecided (see README).
- `apps/web` uses TypeScript 6.x (pinned by `svelte-check` compatibility) while Bun ships `bun check` against TS 7. Both pass today; revisit when `svelte-check` supports TS 7. Recorded in `research/stack-versions.md`.

## Recent journal entries

- [001 — Repo bootstrap](journal/001-repo-bootstrap.md)
