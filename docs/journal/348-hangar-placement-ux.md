# 348 — Hangar placement UX

**Plan:** [plans/348-hangar-placement-ux.md](../plans/348-hangar-placement-ux.md) · **Session:** hangar placement UX session (Claude) · **Date:** 2026-10-22 · **ADR:** 0297

## What was done

- Research note `research/ksp-editor-placement.md`: how KSP 1 and 2 carry, snap, attach to surfaces, do symmetry, gizmos, re-root and undo, and a table against our Hangar.
- The jump: `standingLows` (renderer `scene-model.ts`) counts only `solid` parts, and the view stands each group on the floor from it. Ghosts and the free cursor part no longer lift the vessel.
- `apps/web/src/lib/vab/placement-pick.ts` `nextPlacement`: ring hit, else a ring within `SNAP_PX` on screen (held until 1.5× and unless another ring is at most 60 % of its distance), else the surface site, else the cursor point; over the ghost the previous place stays. The view's `nodesNearPointer` now also returns each glowing ring's screen distance.
- The controller: `pointerDriven` hides the keyboard's default target (the last part's bottom node) once the pointer moves; the pick always looks through the ghost; a click, a drop and Enter place where the ghost shows (`placeShown`).
- Root tool (key 4, pill button): `editor/reroot.ts` turns over the stack links from the picked part to the old root; a radial, surface, tilted or moved link on the path is refused with a notice. One undo step.
- A right click (no drag) while carrying lets go, as Esc.
- Hangar keys overlay: `HelpOverlay` with `hangar`, opened by `?`/F1 (`hangarHelp`) or the pill's `?` button.

## What surprised me

- The bug had two halves that fed each other: the ghost fell back to the default target whenever the pointer was over the ghost (the pick stopped at the ghost for stack parts), and that ghost under the vessel lifted it, which moved the ghost away from the pointer again.
- In the dev Hangar the old floor rule would have given the booster 9 different heights over one sweep of the pointer beside it (40 to 120 px off the axis, 400 px tall); the new rule gives one.

## Verification output

See the plan's acceptance criteria; outputs below.

## Open questions

- KSP's F in Place mode (symmetry around the vessel or the parent) is not done; our symmetry is around the parent.
- Re-rooting through radial or surface links needs the link turned into the other part's frame; left for a later plan.
