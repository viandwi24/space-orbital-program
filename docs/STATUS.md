# Project status

> Living document. Updated at the end of every plan. Keep it short; details go in plans, ADRs and the journal.

**Last updated:** 2026-10-16
**Phase:** 1 — MVP (complete: plan 009's manual run built the two-stage vessel in the browser, reached a 76 km periapsis orbit and drew it in map view). Phase 2 started with plan 010 (scripting sandbox, done)
**Current plan:** none in progress by the VAB session; 022 (3D vehicle assembly building) is done
**Next plan:** 023 (release readiness; builds on the design system, the HUD and the VAB) and the follow-up drafts 026 and 027 (024 and 025 are done). Target for all visual plans: [`product/visual-direction.md`](product/visual-direction.md).

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
| 018 | [Script sharing container and ship API constants](plans/018-script-sharing-and-ship-api.md) | done | script-api session | ADR 0031: each Run's script in its own killable Worker (a native `indexOf` stalled QuickJS 25 s past the budget), watchdog 500 ms, command filter; `ship.engines`/`wheels`, sample without constants, `guides/scripting.md`; browser run to orbit not repeated (see plan) |
| 019 | [Visual: flight environment](plans/019-flight-environment.md) | done | environment session | ADR 0027; analytic planet + atmosphere + clouds + stars pass, launch site, sun with shadows, bloom/ACES chain, presets low/medium/high (`Renderer.setPreset`); 1080p high 8-15 ms on an M5, M1/M2 not measured; launch site inferred from the first vessel (sim places at an inertial longitude, see plan 025) |
| 020 | [Visual: part models, materials and effects](plans/020-part-models-and-effects.md) | done | parts session | ADR 0028 (mod-supplied `visual` descriptor, API 0.1.6, `PartModelProvider` interface); procedural part meshes with PBR and generated textures, plume by throttle and pressure, smoke and dust, separation gas, explosions, re-entry glow and plasma; `high` under 16.7 ms sync on an M5 (M1/M2 not measured); explosion, vacuum and re-entry shots use synthetic snapshots |
| 021 | [UI: design system and flight HUD](plans/021-hud-and-ui-design-system.md) | done | hud session | ADR 0026; tokens, components, own icons and OFL fonts in `apps/web/src/lib/ui`; canvas navball, surface/orbit speed, stage stack with exact per-stage Δv (`lib/delta-v.ts`, shared with the VAB), toasts from sim events, pause menu, controls overlay, map Ap/Pe markers; sim host `pause` and `sim-event` messages |
| 022 | [UI: 3D vehicle assembly building](plans/022-vab-3d.md) | done | vab session | ADR 0029; procedural hangar view (`VabView`), rendered part thumbnails by category with search, attach by clicking rings with a ghost preview, move/detach/delete with loose assemblies, undo/redo, stage editor with auto-staging and drag between stages, exact Δv/TWR per stage (shared with the HUD) and a trip estimate, eight launch checks, save/load JSON; two-stage vessel built by mouse and by keyboard reached orbit; 4 ms per frame at 1080p ratio 1 and 9 ms at 1.5 on an M5, M1/M2 not measured; follow-ups are draft 029 |
| 023 | [Release readiness](plans/023-release-readiness.md) | draft | — | menus, settings, perf budget, polish, release checklist; needs 019–022 |
| 024 | [Tooling hooks: module descriptors for delta-v and Renderer.project](plans/024-tooling-hooks-for-mods-and-renderer.md) | done | tooling session | ADR 0033; `ModuleDefinition.describe` (API 0.1.7) so a mod's engines and separators get stage delta-v and auto-staging; `Renderer.project` replaces the HUD's map-camera mirror; stock Δv unchanged (1,161 + 2,844 m/s sea level) |
| 025 | [Visual: environment follow-ups](plans/025-environment-follow-ups.md) | done | environment-2 session | ADR 0030; sim places at body-fixed coordinates (renderer inference deleted); grass blades/stripes/tufts, hill shading, forest crowns, fields, rivers, clean coasts, hangar/control centre/vehicles/containers/weathering, leafy trees and groves, floodlights at night; `high` pad 11.6 ms thr / 16.5 ms sync on an M5, M1/M2 not measured; terrain geometry, cloud layers etc. are draft 027 |
| 026 | [Visual: part follow-ups](plans/026-part-visual-follow-ups.md) | draft | — | radial parts and fins, glTF asset provider, engine states, volumetric smoke, real debris, plasma shape, M1/M2 tuning; from the 020 self-review |
| 029 | [UI: VAB follow-ups](plans/029-vab-follow-ups.md) | draft | — | from 022: vessel library, sub-assemblies, radial attach (needs 026), hangar polish, mod-supplied categories, fuller trip planner, M1/M2 measurements |
| 027 | [Visual: terrain geometry, sky and device follow-ups](plans/027-terrain-and-sky-follow-ups.md) | draft | — | from 025: heightfield terrain with silhouettes, cloud layers and haze, water, animated site, M1/M2 measurements |
| 030 | [Script hardening and tooling follow-ups](plans/030-script-hardening-and-tooling.md) | draft | — | from 018: CSP/sandboxed iframe for the script Worker, Safari/Firefox nested Workers, share/import UI, API additions |
| 016 | [Landed vessels on surface-fixed rails](plans/016-landed-vessels-on-rails.md) | done | surface-rails session | ADR 0024; controlled vessel at rest 2 s on the ground goes on `surface` rails (turns with the planet, no orbit, snapshot `surface`); warp works on the pad and after landing, wake by the usual commands; API 0.1.5 |

Statuses: `draft` (needs refinement before an agent takes it) · `ready` · `in-progress` · `done` · `blocked`.

## Phases

- **Phase 0 — Foundation** (plans 001–006): repo, math, core runtime, physics adapter, SDK, stock content. Everything headless; passes in Bun with no browser.
- **Phase 1 — MVP** (plans 007–009): a rocket built from stock parts launches from a spherical home planet, stages, reaches a stable orbit, and the orbit is drawn in a map view. Runs in the browser.
- **Phase 2 — Mod ecosystem** (010+): scripting sandbox, external mod loading, mod patching, save/load.
- **Phase 3 — World**: terrain LOD, more bodies, atmosphere model, re-entry heating.

## Known issues / open questions

- The launch site is body-fixed (0, 0) and the sim places vessels there at any load time (plan 025, ADR 0030). Relief in the ground shader is shading only: no mountain silhouettes, trees and buildings stay on the reference sphere. The first body is drawn by the planet pass; other bodies are plain lit spheres. Frame times are measured on an Apple M5 only (`high` at the pad is at the 16.7 ms limit in the synchronous metric); haze makes land look milky at 3 to 10 km (draft plan 027).
- Part visuals (plan 020, ADR 0028): only stack parts exist, so there are no fins, boosters or radial hardware; debris is boxes, the re-entry plasma is an ellipsoid shell, smoke is unlit billboards; the explosion, vacuum and re-entry screenshots are synthetic snapshots (a real crash is covered by unit tests and the camera hold, not by a capture); the destroyed vessel's camera holds the wreck for 5 s then jumps to the planet centre (HUD "lost" state). Draft plan 026.
- Vessels on surface rails (ADR 0024) have no colliders: other vessels pass through a parked one. Debris circling inside the atmosphere stays in flight until drag brings it down (ADR 0021). Vite dev reloads the page when a workspace package changes.
- HUD (plan 021, ADR 0026): stage Δv reads module descriptors (`describe`, ADR 0033, plan 024), so a mod's engines and separators count, and the map markers use `Renderer.project`. The HUD throttle gauge still reads the stock engine's snapshot (a mod engine falls back to the page's own value). The layout is tuned for 1280x720 and up, the dev autopilot (`P`) is unreliable under software rendering, and the throttle gauge is read-only.
- VAB (plan 022, ADR 0029): only stack attachment (radial parts and symmetry wait for plan 026); one draft in `localStorage` plus JSON files, no vessel library; the Δv trip estimate is a rule of thumb (1.3 km/s loss allowance); the hangar is dark and static away from the vessel; frame time measured only on an Apple M5 (4 ms at 1080p ratio 1, 9 ms at 1.5); the layout targets 1280x720 and up (the right panel is cut off below about 1000 px). Draft plan 029.
- Package scope `@orbital/*` is a placeholder; rename before any publish (ADR needed).
- License undecided (see README).
- `apps/web` uses TypeScript 6.x (pinned by `svelte-check` compatibility) while Bun ships `bun check` against TS 7. Both pass today; revisit when `svelte-check` supports TS 7. Recorded in `research/stack-versions.md`.
- Flight vessels are one rigid compound body (plan 011, ADR 0018): no joint flex; parts only break off by ground impact (plan 012, ADR 0019), not by load or collision between vessels. `createRapierBackend({ solverIterations })` still matters for contacts between bodies. Rapier is f32 and first-order (position error `a·dt·t/8` under constant force).
- Sim limits (see `architecture/simulation.md`): flat ground tile on the reference sphere (no terrain heights), no lift/fins, simplified re-entry heating (windward area only, no conduction/wake, ADR 0023), one 2.5 km physics bubble, attitude frozen on rails.
- A plugin's `contributes` keys are type-only: declaring one and never calling `ctx.provide` for it is not detected at load time (dependents see `undefined`). See ADR 0013.
- Scripts run in their own Worker per Run (plan 018, ADR 0031): a runaway or wedged script cannot delay a sim tick and is killed after 500 ms without an answer; commands act on data one or more ticks old. The per-tick interrupt budget (10 ms, first tick 200 ms) does not bound native builtins (a long `indexOf` ran 25 s). QuickJS-WASM is unaudited upstream and the script Worker still has same-origin `fetch` and IndexedDB (hosting CSP and a sandboxed iframe are draft 030). Nested Workers verified in the built-in (Chromium) browser only.

## Recent journal entries

- [024 — Tooling hooks: module descriptors and Renderer.project](journal/024-tooling-hooks-for-mods-and-renderer.md)
- [018 — Script sharing container and ship API constants](journal/018-script-sharing-and-ship-api.md)
- [022 — UI: 3D vehicle assembly building](journal/022-vab-3d.md)
- [025 — Visual: environment follow-ups](journal/025-environment-follow-ups.md)
- [021 — UI: design system and flight HUD](journal/021-hud-and-ui-design-system.md)
- [020 — Visual: part models, materials and effects](journal/020-part-models-and-effects.md)
- [019 — Visual: flight environment](journal/019-flight-environment.md)
- [017 — Script panel follow-ups and landed HUD](journal/017-script-panel-follow-ups.md)
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
