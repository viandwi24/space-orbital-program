# Project status

> Living document. Updated at the end of every plan. Keep it short; details go in plans, ADRs and the journal.

**Last updated:** 2026-10-16
**Phase:** 0 — Foundation
**Current plan:** [`plans/007-sim-loop-flight-onrails.md`](plans/007-sim-loop-flight-onrails.md) (in progress, sim session)
**Next plan:** [`plans/007-sim-loop-flight-onrails.md`](plans/007-sim-loop-flight-onrails.md) (`draft`, needs refinement; dependencies 002, 004, 006 are done)

## Plan board

| # | Plan | Status | Owner | Notes |
|---|---|---|---|---|
| 001 | [Repo bootstrap](plans/001-repo-bootstrap.md) | done | bootstrap session | scaffold, workspaces, docs system |
| 002 | [Kepler orbital mechanics](plans/002-kepler-orbital-mechanics.md) | done | kepler session | state↔elements, propagation, SOI; one AC value corrected (see plan Log) |
| 003 | [Core: world, registries, events](plans/003-core-world-registries-events.md) | done | core session | ADRs 0010, 0011 |
| 004 | [Physics backend + Rapier adapter](plans/004-physics-backend-rapier.md) | done | physics session | `createRapierBackend` + `createMockBackend`; free-fall AC corrected to Rapier's discrete solution (see plan Log) |
| 005 | [SDK define-API + plugin loader](plans/005-sdk-define-api-plugin-loader.md) | done | sdk session | ADR 0013; `loadPlugins`, `define*`, typed ctx |
| 006 | [Stock mod, minimal](plans/006-stock-mod-minimal.md) | done | stock session | ADR 0014 (part shape, `state(config)`); 6 parts, home body, `guides/writing-a-mod.md` |
| 007 | [Sim loop: flight + on-rails](plans/007-sim-loop-flight-onrails.md) | in-progress | sim session | needs 002, 004, 006 (all done); see its Log for 006's notes |
| 008 | [Renderer: floating origin](plans/008-renderer-floating-origin.md) | done | renderer session | ADR 0012; WebGL parts verified only in plan 009 |
| 009 | [Web client MVP: build, launch, orbit](plans/009-web-client-mvp.md) | draft | — | needs 007, 008 |
| 010 | [Scripting sandbox](plans/010-scripting-sandbox.md) | draft | — | after MVP |
| 011 | [Physics rigid grouping](plans/011-physics-rigid-grouping.md) | draft | — | needs 004, 007; follow-up from 004 |

Statuses: `draft` (needs refinement before an agent takes it) · `ready` · `in-progress` · `done` · `blocked`.

## Phases

- **Phase 0 — Foundation** (plans 001–006): repo, math, core runtime, physics adapter, SDK, stock content. Everything headless; passes in Bun with no browser.
- **Phase 1 — MVP** (plans 007–009): a rocket built from stock parts launches from a spherical home planet, stages, reaches a stable orbit, and the orbit is drawn in a map view. Runs in the browser.
- **Phase 2 — Mod ecosystem** (010+): scripting sandbox, external mod loading, mod patching, save/load.
- **Phase 3 — World**: terrain LOD, more bodies, atmosphere model, re-entry heating.

## Known issues / open questions

- Package scope `@orbital/*` is a placeholder; rename before any publish (ADR needed).
- License undecided (see README).
- `@orbital/kepler` element functions throw `KeplerError` for near-parabolic (|e − 1| < 1e-8) and radial trajectories; plan 007's flight → on-rails switch must handle this (fallback: `propagateUniversal` on the state vector). Noted in `architecture/simulation.md`.
- `apps/web` uses TypeScript 6.x (pinned by `svelte-check` compatibility) while Bun ships `bun check` against TS 7. Both pass today; revisit when `svelte-check` supports TS 7. Recorded in `research/stack-versions.md`.
- Rapier fixed-joint chains are soft under heavy load (default 4 solver iterations; see `journal/004`); `createRapierBackend({ solverIterations })` is the knob and plan 011 (rigid grouping) the structural fix. Rapier is f32 and first-order (position error `a·dt·t/8` under constant force).
- Stock module hooks cannot apply forces or move resources (`ModuleContext` has no body handle or vessel resource access); plan 007 must either apply the effects from the documented stock config/state or extend `ModuleContext` additively. Contract: `journal/006`.
- A plugin's `contributes` keys are type-only: declaring one and never calling `ctx.provide` for it is not detected at load time (dependents see `undefined`). See ADR 0013.

## Recent journal entries

- [006 — Stock mod, minimal](journal/006-stock-mod-minimal.md)
- [005 — SDK define-API + plugin loader](journal/005-sdk-define-api-plugin-loader.md)
- [004 — Physics backend + Rapier adapter](journal/004-physics-backend-rapier.md)
- [008 — Renderer: floating origin](journal/008-renderer-floating-origin.md)
- [003 — Core: world, registries, events](journal/003-core-world-registries-events.md)
- [002 — Kepler orbital mechanics](journal/002-kepler-orbital-mechanics.md)
- [001 — Repo bootstrap](journal/001-repo-bootstrap.md)
