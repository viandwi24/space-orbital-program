# 024 — Tooling hooks: module descriptors and `Renderer.project`

**Plan:** plans/024-tooling-hooks-for-mods-and-renderer.md · **Session:** tooling session (Claude, 2026-10-16) · **Date:** 2026-10-16 · **ADR:** [0033](../decisions/0033-module-descriptors-and-renderer-project.md)

## What was done

The draft was refined to `ready` at the human's request (ADR 0033, measurable criteria, Log line), then implemented in four commits plus docs.

| Where | What |
|---|---|
| `packages/core` | `moduleInfoSchema` (`schemas.ts`), `ModuleInfo`/`EngineInfo`/`SeparatorInfo` and `ModuleDefinition.describe` (`definitions.ts`), `describeModule`, `thrustAtPressure`, `SEA_LEVEL_PRESSURE`, `STANDARD_GRAVITY` (`module-info.ts`); `API_VERSION` 0.1.6 to 0.1.7 |
| `packages/sdk` | Re-exports of the above and the types |
| `mods/stock` | `stock.engine` and `stock.decoupler` describe themselves; `SEA_LEVEL_PRESSURE` and `G0` are the SDK's constants now |
| `apps/web/src/lib/delta-v.ts` | No stock id, no `@orbital/mod-stock` import: engines and separators come from descriptors, tanks from `store` |
| `apps/web/src/lib/editor/` | `staging.ts` (auto-staging by descriptor; `Content` now carries `modules`), `part-info.ts` (Thrust, Isp, Propellant from descriptor and store); `routes/vab/+page.svelte` passes `modules` |
| `packages/renderer` | `project.ts` (pure `projectWorldPoint`, `segmentHitsSphere`), `SceneModel.project`, `Renderer.project` |
| `apps/web/src/lib/hud-controller.ts`, `flight-loop.ts` | Map markers call `Renderer.project` (the controller gets a `project` option); `map-projection.ts` and its test deleted, the camera forwarding (`camera.orbit`, `resize`) with them |

## Verification

- Stock numbers unchanged: `stageDeltaV` of the reference vessel gives 1,160.98 and 2,844.16 m/s at sea level, 1,243.91 and 3,047.31 m/s in vacuum, identical to the old code to 1e-15 (pinned by rounding in `delta-v.test.ts`). In the browser the VAB showed 1,161 and 2,844 m/s, 4,005 total, and the flight HUD the same, and 995 m/s for the stage burning at T+0:42.
- Third-party mod: `delta-v-mod.test.ts` has a plugin with its own resource, engine module (own config, two engines with different thrust curves), separator module and parts; per-stage vacuum and sea-level delta-v match Tsiolkovsky by hand to 1e-9, burn times 25 s and 50 s, a live snapshot with half a tank gives the exact remaining burn, and `autoStages` stages `[[5], [2, 3]]`.
- `Renderer.project` against a known camera (pinhole numbers by hand, field-of-view edges land on the screen edges, behind-camera null, occlusion cases) and through `SceneModel` in map view with the body 1.5e11 m from the world origin (centre is the screen centre, a sideways offset follows the pinhole model before and after an orbit input).
- `[manual]` map view at 1920x1080 and 1280x720 (viewport emulation in the built-in browser): the dev autopilot reached a 76 x 242 km orbit; the Ap marker (dimmed on the far side of the body) and the Pe marker sit on the orbit line, the vessel dot too, also after dragging the camera (`assets/024-map.png`, 1920x1080 emulation after an orbit drag).

## Surprises

- A vite dev reload (another session editing a workspace package) reset the flight once; the second run reached orbit.
- The dev autopilot key needs `event.code === 'KeyP'`, which the tool's `key` action does not send; a dispatched `KeyboardEvent` does.
- `refine` in zod 4 still runs after `min(1)` failed, so the thrust-curve check had to tolerate an empty array.

## Open questions and found, not done

- `hud-model.ts` `vesselThrottle` still reads `stock.engine`'s snapshot for the throttle gauge; a mod engine falls back to the page value. A `throttle` in the engine descriptor would fix it.
- `editor/categories.ts` still maps stock module ids to VAB categories (plan 029, mod-supplied categories).
- The descriptor models one separator node per module and one propellant mix per engine, the stack rule for what leaves, and a piecewise-linear thrust curve; radial parts need more (see plan 026 notes below).

## For plan 026 (radial attachment, fins, boosters)

- A booster decoupler is a `separator` with the node facing the core stage; `delta-v.ts` finds the link by node id and cuts there (`fireDecoupler`) with the sim's rule (root side stays unless only the other side has a control source). With radial attachment a part has several links on one node name or on radial nodes: the descriptor already carries a node id, but `fireDecoupler` assumes one link per node (`links.find`) and must cut all links on it; `autoStages` assumes depth along a parent chain, which stays valid for a radial child of a decoupler.
- Crossfeed: `reach` in `delta-v.ts` walks every link and stops at `crossfeed: false` parts. Fuel lines or radial crossfeed need either a part flag per node or a descriptor field; the sim's `vessel.resources` rule must change in the same plan.
- `describe` receives config and the snapshot view only: an engine gimballed or angled radially needs a `direction` in the engine info (thrust is assumed along the flight axis today).
- New module kinds belong in `ModuleInfo` additively (API patch), validated by `moduleInfoSchema`; the VAB's `isAutoStaged` treats any part with `engine` or `separator` as stageable.
