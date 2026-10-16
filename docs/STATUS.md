# Project status

> Living document. Updated at the end of every plan. Keep it short; details go in plans, ADRs and the journal.

**Last updated:** 2026-10-16
**Phase:** 1 — MVP (complete: plan 009's manual run built the two-stage vessel in the browser, reached a 76 km periapsis orbit and drew it in map view). Phase 2 started with plan 010 (scripting sandbox, done)
**Current plan:** none in progress; 017 (script panel follow-ups and landed HUD) is done
**Next plan:** visual overhaul requested by the human (2026-10-16): drafts 019 (environment) and 021 (HUD/design system) first, then 020, 022, 023 — target in [`product/visual-direction.md`](product/visual-direction.md). Draft 018 (script sharing) is parked.

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
| 010 | [Scripting sandbox](plans/010-scripting-sandbox.md) | done | scripting session | ADR 0020; `@orbital/scripting`: QuickJS-WASM runner, ship API, per-tick budget, sample ascent script reaches a 76 km periapsis orbit |
| 012 | [Ground contact, landing and damage](plans/012-ground-contact-landing.md) | done | ground session | ADR 0019; kinematic ground tile with friction, `stock.landing-legs`, impact damage (`part:damaged`); pad hold and sphere clamp removed; lander from 100 km orbit lands in `bun test` |
| 011 | [Physics rigid grouping](plans/011-physics-rigid-grouping.md) | done | grouping session | ADR 0018; one compound body per vessel; 100-part step 735 → 140 µs (sim), no flex |
| 013 | [Debris lifecycle and time warp](plans/013-debris-lifecycle.md) | done | debris session | ADR 0021; ballistic debris goes on rails and is removed at re-entry, resting debris after 10 s; warp works 3 s after reaching orbit |
| 014 | [Re-entry heating and part temperature](plans/014-reentry-heating.md) | done | heating session | ADR 0023; Sutton-Graves skin heating, radiation, `maxTemperature`, ablative `stock.heat-shield`; API 0.1.4; unshielded deorbit probe loses its tank at 900 K, shielded survives burning 18.75 kg of ablator |
| 015 | [Scripting in the web client](plans/015-scripting-web-integration.md) | done | script-web session | ADR 0022; runner in the sim Worker, script panel in `/flight`; sample ascent from the panel reaches a 76.9 km periapsis, `while (true) {}` is terminated at the 10 ms budget with the page live |
| 017 | [Script panel follow-ups and landed HUD](plans/017-script-panel-follow-ups.md) | done | panel session | no ADR; script text persists per design, HUD stage counter follows `stage:activated` (a script's `stage()` counts), HUD shows landed/orbit/suborbital/flight with warp buttons; dev autopilot starts from surface rails |
| 018 | [Script sharing container and ship API constants](plans/018-script-sharing-and-ship-api.md) | draft | — | split from 017: runner in its own Worker when scripts become shareable, engine/wheel constants in `ship` |
| 019 | [Visual: flight environment](plans/019-flight-environment.md) | done | environment session | ADR 0027; analytic planet + atmosphere + clouds + stars pass, launch site, sun with shadows, bloom/ACES chain, presets low/medium/high (`Renderer.setPreset`); 1080p high 8-15 ms on an M5, M1/M2 not measured; launch site inferred from the first vessel (sim places at an inertial longitude, see plan 025) |
| 020 | [Visual: part models, materials and effects](plans/020-part-models-and-effects.md) | done | parts session | ADR 0028 (mod-supplied `visual` descriptor, API 0.1.6, `PartModelProvider` interface); procedural part meshes with PBR and generated textures, plume by throttle and pressure, smoke and dust, separation gas, explosions, re-entry glow and plasma; `high` under 16.7 ms sync on an M5 (M1/M2 not measured); explosion, vacuum and re-entry shots use synthetic snapshots |
| 021 | [UI: design system and flight HUD](plans/021-hud-and-ui-design-system.md) | done | hud session | ADR 0026; tokens, components, own icons and OFL fonts in `apps/web/src/lib/ui`; canvas navball, surface/orbit speed, stage stack with exact per-stage Δv (`lib/delta-v.ts`, shared with the VAB), toasts from sim events, pause menu, controls overlay, map Ap/Pe markers; sim host `pause` and `sim-event` messages |
| 022 | [UI: 3D vehicle assembly building](plans/022-vab-3d.md) | draft | — | 3D hangar, part catalogue with icons, node picking, Δv/TWR, validation; needs 020, 021 |
| 023 | [Release readiness](plans/023-release-readiness.md) | draft | — | menus, settings, perf budget, polish, release checklist; needs 019–022 |
| 025 | [Visual: environment follow-ups](plans/025-environment-follow-ups.md) | draft | — | terrain heights, vegetation, weather, sim launch-site coordinates, M1/M2 tuning; from the 019 self-review |
| 016 | [Landed vessels on surface-fixed rails](plans/016-landed-vessels-on-rails.md) | done | surface-rails session | ADR 0024; controlled vessel at rest 2 s on the ground goes on `surface` rails (turns with the planet, no orbit, snapshot `surface`); warp works on the pad and after landing, wake by the usual commands; API 0.1.5 |
| 026 | [Visual: part follow-ups](plans/026-part-visual-follow-ups.md) | draft | — | radial parts and fins, glTF asset provider, engine states, volumetric smoke, real debris, plasma shape, M1/M2 tuning; from the 020 self-review |

Statuses: `draft` (needs refinement before an agent takes it) · `ready` · `in-progress` · `done` · `blocked`.

## Phases

- **Phase 0 — Foundation** (plans 001–006): repo, math, core runtime, physics adapter, SDK, stock content. Everything headless; passes in Bun with no browser.
- **Phase 1 — MVP** (plans 007–009): a rocket built from stock parts launches from a spherical home planet, stages, reaches a stable orbit, and the orbit is drawn in a map view. Runs in the browser.
- **Phase 2 — Mod ecosystem** (010+): scripting sandbox, external mod loading, mod patching, save/load.
- **Phase 3 — World**: terrain LOD, more bodies, atmosphere model, re-entry heating.

## Known issues / open questions

- Launch site of the renderer is inferred from the first vessel near the ground, because `placeOnSurface` uses an inertial longitude and the body is already turning at load time (ADR 0027, draft plan 025). The first body is drawn by the planet pass; other bodies are plain lit spheres. Frame times are measured on an Apple M5 only.
- Vessels on surface rails (ADR 0024) have no colliders: other vessels pass through a parked one. Debris circling inside the atmosphere stays in flight until drag brings it down (ADR 0021). Vite dev reloads the page when a workspace package changes.
- Part visuals (plan 020, ADR 0028): only stack parts exist, so there are no fins, boosters or radial hardware; debris is boxes, the re-entry plasma is an ellipsoid shell, smoke is unlit billboards; the explosion, vacuum and re-entry screenshots are synthetic snapshots (a real crash is covered by unit tests and the camera hold, not by a capture); the destroyed vessel's camera holds the wreck for 5 s then jumps to the planet centre (HUD "lost" state). Draft plan 026.
- Package scope `@orbital/*` is a placeholder; rename before any publish (ADR needed).
- License undecided (see README).
- `apps/web` uses TypeScript 6.x (pinned by `svelte-check` compatibility) while Bun ships `bun check` against TS 7. Both pass today; revisit when `svelte-check` supports TS 7. Recorded in `research/stack-versions.md`.
- Flight vessels are one rigid compound body (plan 011, ADR 0018): no joint flex; parts only break off by ground impact (plan 012, ADR 0019), not by load or collision between vessels. `createRapierBackend({ solverIterations })` still matters for contacts between bodies. Rapier is f32 and first-order (position error `a·dt·t/8` under constant force).
- Sim limits (see `architecture/simulation.md`): flat ground tile on the reference sphere (no terrain heights), no lift/fins, simplified re-entry heating (windward area only, no conduction/wake, ADR 0023), one 2.5 km physics bubble, attitude frozen on rails.
- A plugin's `contributes` keys are type-only: declaring one and never calling `ctx.provide` for it is not detected at load time (dependents see `undefined`). See ADR 0013.
- Scripts run on the caller's thread with a per-tick wall-clock budget (ADR 0020, `architecture/scripting.md`): a runaway script delays the host by at most one budget. In the web client the runner runs inside the sim Worker (plan 015, ADR 0022), so it delays a sim tick, never a frame; a healthy script adds its per-tick work to every sim tick. QuickJS-WASM is unaudited upstream. A script's first tick (cold QuickJS) can sit near the 10 ms budget in dev (journal 017).

## Recent journal entries

- [019 — Visual: flight environment](journal/019-flight-environment.md)
- [017 — Script panel follow-ups and landed HUD](journal/017-script-panel-follow-ups.md)
- [021 — UI: design system and flight HUD](journal/021-hud-and-ui-design-system.md)
- [020 — Visual: part models, materials and effects](journal/020-part-models-and-effects.md)
- [016 — Landed vessels on surface-fixed rails](journal/016-landed-vessels-on-rails.md)
- [015 — Scripting in the web client](journal/015-scripting-web-integration.md)
- [014 — Re-entry heating and part temperature](journal/014-reentry-heating.md)
- [013 — Debris lifecycle and time warp](journal/013-debris-lifecycle.md)
- [010 — Scripting sandbox](journal/010-scripting-sandbox.md)
- [012 — Ground contact, landing and damage](journal/012-ground-contact-landing.md)
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
