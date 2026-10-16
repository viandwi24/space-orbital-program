# 0033 — Module descriptors for tools, and `Renderer.project`

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/024-tooling-hooks-for-mods-and-renderer.md

## Context

Two things plan 021 (ADR 0026) had to work around:

1. Stage delta-v (`apps/web/src/lib/delta-v.ts`, shared by the HUD and the VAB) recognised the stock engine and decoupler modules by id and borrowed their arithmetic from `@orbital/mod-stock`. A mod's engine or separator therefore contributed nothing: its stage showed 0 m/s and the vessel's total was wrong. The sim has no such problem because modules act through `ModuleContext.vessel` (ADR 0015); a *tool* that wants to predict the sim has no way to ask a module what it does.
2. The map markers (Ap, Pe, vessel) mirrored the renderer's map camera in the page, with a test pinning the mirror to the real camera. The renderer had no projection method.

## Decision

Additive API change, 0.1.6 → 0.1.7 (patch while 0.x, `conventions/versioning.md`).

### Module descriptor

`ModuleDefinition.describe?(config, state): ModuleInfo`, a pure function of the parsed config and the module's state that tools call; it never touches the world or the vessel. The result is plain data, validated by `moduleInfoSchema` (core, exported by the SDK) so a bad descriptor fails with the module id in the message instead of corrupting a calculation.

```ts
interface ModuleInfo {
  engine?: {
    massFlow: number;                              // kg/s at full throttle, > 0
    thrust: { pressure: number; thrust: number }[]; // N at full throttle over ambient pressure (Pa)
    propellants: { resource: string; ratio: number }[]; // ratio by volume, as the stock config
    ignited: boolean;
    flameout: boolean;
  };
  separator?: { node: string; done: boolean };
}
```

- **Thrust and Isp curve.** `thrust` is a piecewise-linear curve over ambient pressure: points ascending, the first at 0 Pa (vacuum), values clamped beyond the ends. A tool gets thrust at any pressure by `thrustAtPressure(curve, p)` and Isp by thrust / (massFlow · g0); delta-v of a burn is `(F / massFlow) · ln(m0 / m1)`, so tools need no g0 and no engine model of their own. Stock uses two points (vacuum, `SEA_LEVEL_PRESSURE`), which reproduces its linear Isp interpolation exactly. Mass flow is its own field because the stock engine fixes it by the vacuum rating, not by pressure; an engine whose flow differs is described honestly.
- **Propellants** are the resource ids the engine draws with volume ratios; the tool converts to mass flows with the registry's densities and finds the stores with the sim's rule (`flowMode`, `crossfeed`, ADR 0015). Stores themselves are not part of the descriptor: `ModuleDefinition.store` already tells tools what a tank holds.
- **Separators.** `node` is the attach node of the part the module severs when staged (what it passes to `vessel.detach`); `done` is true once fired. What staging does to the attach graph is therefore fixed by the same rule the sim uses: the side without the root, or without the control source when only the other side has one, leaves (ADR 0015/0016). A module that detaches something else describes nothing and tools see a plain part.
- **State.** For a design, `describe` receives a fresh `state(config)`; for a live vessel, the module's snapshot view (what `snapshot` returns). A descriptor must therefore read only fields its `snapshot` exposes. Stock's snapshot equals its state for both modules.
- **Helper.** `describeModule(def, rawConfig, view?)` in core parses the config (as the loader does), picks the state, calls `describe` and validates the result. `delta-v.ts` and the auto-staging in the editor use it; neither names a stock module id.

### `Renderer.project`

`Renderer.project(world: Vec3): ScreenPoint | null`, `ScreenPoint = { x, y, hidden }`. `world` is in the sim's inertial frame (a body's `position` plus a vessel's SOI-relative `position`, the frame snapshots use). x and y are CSS pixels inside the canvas box (origin top-left). `null` when the point is behind the camera. `hidden` is true when any rendered body (a sphere of its radius) lies between the camera and the point, which is what the markers need to dim.

The maths is a pure function in the renderer (`projectWorldPoint(camera matrices, render-space point, width, height)`, plus `segmentHitsSphere`), unit-tested against a known camera. `SceneModel.project` converts the point with the floating origin (`toRenderSpace`, float64), re-places the camera first if the rig changed since the last sync (so an orbit input is visible to the next call, as with the old mirror), and calls it. The facade exposes it. The page no longer duplicates the rig, the field of view or the occlusion test, and `map-projection.ts` is deleted.

## Alternatives considered

- **Callbacks instead of data** (`engine.thrustAt(p)`, `separates()`): not serializable and not schema-checkable; a data curve is checkable, loggable and can later be sent to a worker. The cost is that engines must fit a piecewise-linear thrust curve, which covers everything the sim does now.
- **Descriptors on the part, not the module:** the module owns its config schema and state, so only it can read them.
- **A per-module `tools.deltaV` hook that returns delta-v itself:** puts staging logic (reachability, order, crossfeed) in every mod and cannot account for what another mod's tank holds.
- **Unprojected world points in `project` (render space) or body-relative points:** the caller would need the renderer's origin or the SOI body; world points are what the sim publishes.
- **Reading the camera matrices in the page:** exposes Three.js to the page (`apps/web` is allowed Three but the HUD controller is not), and the mirror is exactly this.

## Consequences

- Plan 026 (radial attachment, boosters) extends `separator` with more than one node or a radial separator and the staging rule in `delta-v.ts` and `autoStages` with it; a descriptor already carries the node.
- A module that is both engine and separator is allowed (both keys).
- `vesselThrottle` in the HUD still reads the stock engine's throttle; a mod engine falls back to the page's own throttle display (listed in the plan as out of scope).
- Mod authors get a documented way to make their engines count in the HUD and VAB (`guides/writing-a-mod.md`).
