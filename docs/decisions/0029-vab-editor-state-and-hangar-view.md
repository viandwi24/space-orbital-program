# 0029 — VAB editor state model and hangar view

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/022-vab-3d.md

## Context

The VAB becomes a 3D editor (ADR 0025 bar). Three questions are not answered by earlier ADRs: where edit state lives and how undo works, how a part is attached in 3D without changing the design format (ADR 0016: flat list, stack attachments only), and how the Three.js view stays separate from Svelte.

## Decision

1. **Editor state is a plain immutable value** (`apps/web/src/lib/editor/state.ts`): `{ design, loose, nextIndex, autoStage, past, future }`. Every operation is a pure function `(state, args) => state`; the Svelte page holds the value in `$state.raw`. Undo and redo move whole snapshots (cap 100); selection, the armed catalogue part and the part being carried are page state, outside history. The design stays the core `VesselDesign` (ADR 0016) and is validated by `resolveVesselDesign`.
2. **Loose assemblies.** Detaching a part removes its subtree from the design and keeps it in `loose` as a stand-alone `VesselDesign` (root = the detached part, indices unchanged and unique across design and loose). They are drawn on the hangar floor, can be picked up and attached again, are never launched and produce the "unattached parts" warning. Moving a subtree is one atomic operation (`moveSubtree`), so it is one undo step. Delete removes a subtree for good.
3. **Attach targets are computed, not typed.** `attachTargets(state, def, content)` lists every free node of the design whose direction is anti-parallel to a node of the new part (ADR 0016 stack rule), with world positions from `resolveVesselDesign`. The view highlights them, the user hovers one (ghost preview of the result) and clicks, or cycles with Tab and Enter. An empty design offers the root position on the assembly platform.
4. **Staging.** The format keeps `stages[k]` = parts fired by the k-th stage command. With `autoStage` on (default) the editor assigns every engine and decoupler a stage from its decoupler depth: a part with `d` decouplers between it and the root (itself excluded) fires in stage `maxDepth - d`; the stock two-stage vessel gets `[[engine], [decoupler, engine]]`, exactly the reference design. Any manual stage edit (moving a part, inserting a stage) turns `autoStage` off until the player presses "Auto-stage". Loading a design sets `autoStage` to whether its stages equal the computed ones. Only engines and decouplers are auto-staged (modules with `onStage` that the Δv model knows); other staged parts (legs) wait in the unstaged tray.
5. **Warnings** are a pure function `checkDesign(state, content, gravity)` returning `{ id, severity, text, parts? }`: errors block Launch (empty design, invalid design); warnings need a confirmation (no control source, no engines, no stages, parts never staged, empty stage, TWR below 1 at liftoff, loose parts). TWR and Δv come from `lib/delta-v.ts` unchanged.
6. **The 3D view is a plain class in `@orbital/renderer` (`vab/`)**, not a Svelte component: `VabView` owns the WebGL renderer, hangar scene, camera rig, picking and icon rendering. The page gives it declarative placements (`{ key, definition, position, role }`) and handles pointer events by calling `pick` and `setHover`. Pure parts (orbit camera maths, node picking, framing) are plain functions with Bun tests. The hangar is built from code only (visual-direction), lit by a key light with shadows, a hemisphere fill and an environment baked from the room itself with `PMREMGenerator.fromScene`.
7. **Catalogue icons** are rendered by the same `VabView` renderer into a `WebGLRenderTarget` with an orthographic camera and a small light rig, read back and cached as data URLs per definition id; categories are derived from module ids in a pure function (`categoryOf`), so no change to `PartDefinition`.

## Alternatives considered

- A mutable store with command objects for undo: more code, and snapshots of a few dozen parts are tiny.
- Putting loose parts into the design with a second root: breaks the "exactly one root" rule that the sim also enforces (ADR 0016).
- Making the view a Svelte component with Threlte-style children: a dependency and per-frame reactivity for something that is imperative by nature.
- `RoomEnvironment` for reflections: generic; the hangar's own lamps give believable highlights for free.

## Consequences

- The design format is unchanged; the editor never produces a design that `resolveVesselDesign` rejects (tested).
- Radial parts and symmetry stay out (plan 026); `attachTargets` is where surface nodes would plug in.
- The hangar and icon code lives in the renderer package (Three.js stays out of every other package).
