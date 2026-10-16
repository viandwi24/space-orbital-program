# Project status

> Living document. Updated at the end of every plan. Keep it short; details go in plans, ADRs and the journal.

**Last updated:** 2026-10-16
**Phase:** 1 — MVP (complete: plan 009's manual run built the two-stage vessel in the browser, reached a 76 km periapsis orbit and drew it in map view). Phase 2 starts with plan 010
**Current plan:** none in progress for the web client; 012 (ground contact) is in progress in another session
**Next plan:** [`plans/010-scripting-sandbox.md`](plans/010-scripting-sandbox.md) (`draft`, needs refinement); also draft 013 (debris blocks warp)

## Plan board

| # | Plan | Status | Owner | Notes |
|---|---|---|---|---|
| 001 | [Repo bootstrap](plans/001-repo-bootstrap.md) | done | bootstrap session | scaffold, workspaces, docs system |
| 002 | [Kepler orbital mechanics](plans/002-kepler-orbital-mechanics.md) | done | kepler session | state↔elements, propagation, SOI; one AC value corrected (see plan Log) |
| 003 | [Core: world, registries, events](plans/003-core-world-registries-events.md) | done | core session | ADRs 0010, 0011 |
| 004 | [Physics backend + Rapier adapter](plans/004-physics-backend-rapier.md) | done | physics session | `createRapierBackend` + `createMockBackend`; free-fall AC corrected to Rapier's discrete solution (see plan Log) |
| 005 | [SDK define-API + plugin loader](plans/005-sdk-define-api-plugin-loader.md) | done | sdk session | ADR 0013; `loadPlugins`, `define*`, typed ctx |
| 006 | [Stock mod, minimal](plans/006-stock-mod-minimal.md) | done | stock session | ADR 0014 (part shape, `state(config)`); 6 parts, home body, `guides/writing-a-mod.md` |
| 007 | [Sim loop: flight + on-rails](plans/007-sim-loop-flight-onrails.md) | done | sim session | ADRs 0015-0017; capability API, `createSim`, scripted two-stage ascent reaches orbit headlessly |
| 008 | [Renderer: floating origin](plans/008-renderer-floating-origin.md) | done | renderer session | ADR 0012; WebGL parts verified only in plan 009 |
| 009 | [Web client MVP: build, launch, orbit](plans/009-web-client-mvp.md) | done | web session | Worker host + client, VAB, flight HUD, map view; dev-only autopilot used for the manual orbit run; renderer verified in real GL |
| 010 | [Scripting sandbox](plans/010-scripting-sandbox.md) | draft | — | after MVP |
| 012 | [Ground contact, landing and damage](plans/012-ground-contact-landing.md) | in-progress | ground session | ADR 0019; ground tile + legs + impact damage; replaces the 007 ground idealisation |
| 011 | [Physics rigid grouping](plans/011-physics-rigid-grouping.md) | done | grouping session | ADR 0018; one compound body per vessel; 100-part step 735 → 140 µs (sim), no flex |
| 013 | [Debris lifecycle and time warp](plans/013-debris-lifecycle.md) | draft | — | found by 009: debris stays in flight and blocks warp after a normal launch |

Statuses: `draft` (needs refinement before an agent takes it) · `ready` · `in-progress` · `done` · `blocked`.

## Phases

- **Phase 0 — Foundation** (plans 001–006): repo, math, core runtime, physics adapter, SDK, stock content. Everything headless; passes in Bun with no browser.
- **Phase 1 — MVP** (plans 007–009): a rocket built from stock parts launches from a spherical home planet, stages, reaches a stable orbit, and the orbit is drawn in a map view. Runs in the browser.
- **Phase 2 — Mod ecosystem** (010+): scripting sandbox, external mod loading, mod patching, save/load.
- **Phase 3 — World**: terrain LOD, more bodies, atmosphere model, re-entry heating.

## Known issues / open questions

- Debris from staging stays in flight and blocks time warp (draft plan 013); Vite dev reloads the page when a workspace package changes.
- Package scope `@orbital/*` is a placeholder; rename before any publish (ADR needed).
- License undecided (see README).
- `apps/web` uses TypeScript 6.x (pinned by `svelte-check` compatibility) while Bun ships `bun check` against TS 7. Both pass today; revisit when `svelte-check` supports TS 7. Recorded in `research/stack-versions.md`.
- Flight vessels are one rigid compound body (plan 011, ADR 0018): no joint flex, no breakage. `createRapierBackend({ solverIterations })` still matters for contacts between bodies. Rapier is f32 and first-order (position error `a·dt·t/8` under constant force).
- Sim limits (see `architecture/simulation.md`): idealised ground (plan 012), no lift/fins, one 2.5 km physics bubble, attitude frozen on rails.
- A plugin's `contributes` keys are type-only: declaring one and never calling `ctx.provide` for it is not detected at load time (dependents see `undefined`). See ADR 0013.

## Recent journal entries

- [009 — Web client MVP](journal/009-web-client-mvp.md)
- [011 — Physics rigid grouping](journal/011-physics-rigid-grouping.md)
- [007 — Sim loop: flight + on-rails](journal/007-sim-loop-flight-onrails.md)
- [006 — Stock mod, minimal](journal/006-stock-mod-minimal.md)
- [005 — SDK define-API + plugin loader](journal/005-sdk-define-api-plugin-loader.md)
- [004 — Physics backend + Rapier adapter](journal/004-physics-backend-rapier.md)
- [008 — Renderer: floating origin](journal/008-renderer-floating-origin.md)
- [003 — Core: world, registries, events](journal/003-core-world-registries-events.md)
- [002 — Kepler orbital mechanics](journal/002-kepler-orbital-mechanics.md)
- [001 — Repo bootstrap](journal/001-repo-bootstrap.md)
