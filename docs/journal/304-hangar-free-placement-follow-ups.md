# 304 — Hangar free placement follow-ups

**Plan:** [plans/304-hangar-free-placement-follow-ups.md](../plans/304-hangar-free-placement-follow-ups.md) · **Session:** Worker A, 2026-10-24 · **ADRs:** 0258 (its "As built" note), 0297, 0301

## What was done

| Where | What |
|---|---|
| `renderer/vab/gizmo.ts`, `view.ts`, `scene-model.ts` | plane handles: three squares clear of the arrows (`planeCorners`), picked by being inside the square (`insidePolygon`, `nearestGizmoHandle`), dragged on the plane (`planeCoordinates`: the ray's distances along the two axes); `GizmoHandle`, `GizmoPlane` |
| `web/vab/controller.svelte.ts` | a plane handle moves the part along both axes at once, snapped like an arrow (Shift: the fine step); the e2e hook shows the gizmo and a part's offset |
| `web/editor/state.ts` | `mirrorOffset`: a mirrored sub-assembly copy's inner parts take their offsets reflected (z flips); `withoutRootPlacement` in `commit`: the root keeps no tilt or offset |
| tests | renderer `vab-gizmo.test.ts` (plane picking, drag maths, kit); web `placement-follow-ups.test.ts` (mirror images, root) |
| e2e | `e2e/hangar-gizmo.e2e.ts`: a part dragged 0.5 m, saved, reloaded, in the same place. Written, **not run** (e2e is paused) |

## Findings

- **Mirrored inner offsets were a real bug**, not covered by plan 357's `mirroredAcrossAxis` (which poses parts about the vessel axis). A mirrored copy took its inner parts' tilts reflected but their offsets as they were: a 0.2 m z offset on a fin made the two halves 0.4 m apart. The reflection is across each parent's XY plane (the plane `mirrorTilt` uses), so z flips, as `memberTransform` does for an inherited copy. The test compares the two copies' positions: x opposite, y and z the same.
- **The root's tilt and offset:** refused, by dropping them. The resolver already ignored both, so no geometry changes; a design that came in with them (an old save or a hand-edited file) loses a value that did nothing, and no edit can make one. The alternative (resolving them) would turn and move the whole design frame, which ADR 0297 (placement never moves the vessel) rules out.

## Not done

- The e2e has not run, so its selectors (`tool-move`, `menu-save`, the reload loading the saved vessel) are unchecked.
- The plane handles were not looked at in a browser; the maths and the picking are tested, the look and the feel of the drag are not.
- Plane handles work in the Move tool only (Rotate has rings).
