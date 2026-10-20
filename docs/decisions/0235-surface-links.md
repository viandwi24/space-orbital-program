# 0235 — Surface links: a part attached at a point and normal of its parent's surface

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/244-hangar-attach-and-pickup.md
**Builds on:** ADR 0071 (tilt), ADR 0221 (the carry loop and radial sites), ADR 0212 (node sizes)

## Context

A part attached to a ring (stack node) or to the side of a cylinder or box (radial link). A top or bottom face, a slope or a cone had no way in, so a player could not put a part where the pointer was.

## Decision

1. **A surface link.** `DesignLink.surface = { point, normal }` in the parent's frame (formatVersion 3). `parentNode` is the reserved name `"surface"`; `radial` is absent. The child's node whose direction best faces the surface is `node`.
2. **Placement.** `placeSurface`: rotation = parent rotation · tilt · `rotationBetween(nodeDir, −normal)` (the shortest arc; a half turn about the vertical, or X for vertical vectors); position = the parent point − rotation · node position. A normal that is horizontal gives the same result as a radial link.
3. **Validation.** The point must lie within 0.05 m of the parent's shape; the node must face the surface; one part per site (`point` to 3 decimals); `parentNode "surface"` needs no `radial`; the format version must be 3 (older files load unchanged, a file with a surface link is refused by older builds).
4. **Symmetry.** Copies of a surface part turn the point and normal about the vertical axis of the parent (a count) or reflect them (a mirror pair); a copy inherits the surface from the member it follows.
5. **Pointer rules in the Hangar.** A face with a slope (|normal.y| ≥ 0.25) or any face of a part without a side node takes a surface link; a cylinder or box side keeps its radial site when the held part is radial. Alt keeps to the rings (node-only). A ring within 36 px of the pointer wins over a face; within 80 px it glows. With nothing under the pointer the held part floats at the cursor (a "free" ghost) at the camera's target distance. Shift-click carries the whole vessel from its root; re-rooting is out of scope.
6. **Size mismatch.** A joint whose node sizes differ carries an orange ring in 3D (state `mismatch`), never picked and never a place to attach.

## Consequences

Saves with a surface link need formatVersion 3. The pointer picks surfaces by the part's real shape, so cones and slopes need no per-part data. Re-rooting a vessel (carry the root, drop another part as root) is a later plan.
