# 0056 — Maneuver nodes: sim-owned, remaining-burn model, shared prediction

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/045-maneuver-nodes.md
**Builds on:** ADR 0049 (SAS), 0050 (save format), 0051 (patched conics). Research: `research/maneuver-nodes.md`.

## Context

v1 needs KSP-style planning (ADR 0048). Questions: who owns the nodes (sim or page), how the burn is tracked while it happens, how the page and the sim agree on the predicted path, how SAS and time warp use a node, and what is saved.

## Decision

1. **Nodes are sim state** in `VesselState.nodes` (a world component, so saved and resumed with everything else, ADR 0010). Each: `id` (per vessel, increasing), `time` (sim s), `prograde`, `normal`, `radial` (m/s, the orbital frame at the node: prograde = unit velocity, normal = unit `r x v`, radial = prograde x normal), and `target`, the absolute post-burn velocity `{ body, v }` at the node time. At most 8 per vessel, sorted by time. Scripts, the HUD and a loaded save all see the same nodes. The page keeps only a drag draft.
2. **Commands (additive, API 0.1.14):** `node-set { vessel, id?, time, prograde, normal, radial }` creates (no `id`; the result carries `node`) or replaces; `node-remove { vessel, id? }` (no id: all); `warp-to { time, factor }`; SAS mode `maneuver`. Refusals: the time is in the past, a value is not finite or beyond 1e5 m/s, nine nodes, unknown id, the vessel has no orbit (surface rails), the path never reaches `time` (impact first).
3. **Remaining burn.** On every set/remove the targets of all nodes are rebuilt in order from the nodes' current remaining burns. The *remaining* burn of a node is `target.v - pre.v`, where `pre` is the velocity the vessel's current orbit has at the node time (a conic propagated forward or, when the time has passed, backward). While coasting it equals the plan; while burning it shrinks to what is left and its components in the orbital frame are what the snapshot reports. If the path now passes the node time in another body than `target.body`, the target is dropped and the plan components apply. A node whose time has passed and whose remaining burn is below 0.5 m/s is removed (event `vessel:maneuver-complete`). A node never executed stays, shown overdue, until removed.
4. **One prediction.** `kepler.predictWithManeuvers(bodies, start, nodes, horizon)` chains `predictPatchedConics` through the nodes: the state at a node is the previous segment's exit, the burn (components or target) is added to the velocity, the next segment starts from there. It returns the segments and, per node, the pre and post states, the burn vector and the segment it lies in. The sim resolves nodes with it (snapshot, SAS); the page draws with it from the snapshot's resolved components, so they agree by construction. The prediction is the impulsive burn; the burn panel states that. Prediction in the sim is capped to 10 days ahead and cached per vessel for on-rails vessels.
5. **SAS `maneuver`** points the nose at the burn vector of the earliest node (direction in the shared inertial axes), in flight (control law of ADR 0049 unchanged) and analytically on rails; with no node it settles like a mode with no direction. A node's direction is fixed in inertial space while coasting; during a burn it follows the remaining vector.
6. **Burn time** is computed on the page from the stage model (`delta-v.ts`): through the stages in order, `t = m0 (1 - exp(-dv/ve)) / mdot` per stage with `ve = dv_stage / ln(m0/mf)`; the burn is centred on the node (starts `t/2` before).
7. **`warp-to`** is sim-side: `core.warpTarget`; `step` lowers the effective warp to `max(1, remaining / 1 s)` and caps the accumulated time so the clock lands on the target; at the target the warp becomes 1. An SOI change of a controlled vessel (ADR 0051) clears it. Refused unless every vessel is on rails, like `warp`. Saved as `SimSave.warpTarget`.
8. **Save format 3.** Older readers would silently drop `nodes` and `warpTarget`, so the version is bumped: migration 2 → 3 gives every vessel `nodes: []`. The v1 and v2 fixtures keep loading; a v3 fixture is frozen.
9. **Map UI.** Handles and markers are DOM elements positioned each frame with `Renderer.project` (like the Ap/Pe markers); the renderer only colours the planned path differently (`MapPathSegment.planned`). Mouse: click the path to add a node, drag a handle to change a component, drag the node along the path to change its time, Delete removes; keyboard on the selected node: `I`/`K` prograde ±, `L`/`J` normal ±, `O`/`U` radial ±, 1 m/s per press, Shift ×10, Alt ×0.1.

## Alternatives considered

- **Nodes in page state:** scripts and saves would not see them, SAS could not read them. Rejected.
- **Plan-only nodes (no target):** the executed burn would leave a node that predicts the same burn again on the new orbit. Rejected.
- **Warp-to as a page controller:** depends on frame timing, not testable headlessly, not available to scripts. Rejected.
- **Finite-burn prediction:** needs thrust and mass flow in the sim's prediction; the impulsive result with a centred burn is the convention.

## Consequences

- Plan 035 keeps `ship.target` and body state over time.
- The sim's snapshot grows by the node list (small).
- Docs: protocol and simulation architecture notes, scripting guide.
