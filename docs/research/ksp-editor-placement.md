# KSP editor placement: carrying, snapping, symmetry, gizmos (plan 348)

Checked 2026-10-22. Builds on `vab-editor.md` and `ksp-part-visuals-and-editor.md`. Sources: the KSP wiki key list (wiki.kerbalspaceprogram.com/wiki/Keys), KSP forum threads on the rotate gizmo (topic 143032) and the KSP 2 snap grid (topic 212845), a 2024 controls guide (mejoress.com), KSP 2 release notes 0.1.3 and 0.2.1. Where sources disagree it is marked; the rest is the common behaviour of both games as players describe it.

## Carrying a part

- A picked part rides the cursor at the depth of the vessel. It is drawn as the part itself, not a box.
- **Node snap is screen-space.** When one of the held part's nodes comes within a fixed on-screen radius of a free node of the vessel, the part jumps to that node. Away from every node the part does not jump anywhere: it keeps following the cursor.
- **Surface attach on hover.** With no node near, a part that allows surface attach (`attachRules` srfAttach) sticks to the surface under the cursor, at the hit point and face normal. A stack-only part (no srf rule) simply floats at the cursor and cannot be dropped there (dropping leaves it loose, unattached and red/ghosted).
- **Priority:** a node in snap reach wins over the surface; Alt (KSP 1: hold Alt while placing) ignores the surface; with node snapping off only the surface counts.
- The vessel never moves while you carry or hover. The ship stands where it is; a ghost may sink into the floor. Placement only happens on click.

## Stack nodes versus surface attach

- Stack nodes are for parts in a column (tanks, decouplers, engines). A part with both may still surface-attach.
- KSP shows the node spheres of the vessel while carrying (green), and the node that will be used turns highlighted. There is no "default node" the part goes to when the cursor is elsewhere.

## Symmetry

- **X** cycles 1, 2, 3, 4, 6, 8 copies (Shift+X back). **R** toggles radial and mirror (sources differ: older KSP used R for mirror in the SPH; the 2024 guide gives R as the radial/mirror toggle).
- Radial copies turn around the **parent part's** vertical axis, not the vessel's, so side boosters on a side tank stay around that tank.
- **F** in Place mode toggles whether symmetry is around the vessel or the parent (2024 guide).
- All copies are shown as ghosts while carrying.
- **C** toggles angle snap (since KSP 0.15). With it on, a surface-attached part's azimuth and its rotation steps snap (15° steps on the side, steps by the symmetry count).

## Offset and rotate gizmos

- Modes **1 Place, 2 Offset, 3 Rotate, 4 Root** (2024 guide; consistent with KSP 1.x).
- Offset: three arrows; dragging moves the part along that axis, limited to a reach around its attach point. Rotate: three rings.
- **F** toggles local (the part's axes) and absolute (the vessel's axes). With angle snap on the steps snap.
- **Shift** with W/A/S/D/Q/E is the fine step (KSP 1: rotate 5° instead of 90° with keys; KSP 2 forum confirms a shift override for finer increments).
- Space resets a carried part's rotation.

## Re-root

- Mode 4: click a part of the vessel to make it the root. Every link on the path between the old and the new root is turned over. KSP refuses parts that are surface-attached on that path ("cannot re-root to a surface-attached part"). Players use it to put a docking port at the root of a sub-assembly.

## Undo

- Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) undo every placement, offset, rotation and re-root as one step each.

## Leaving a part

- Right-click or dropping a carried new part over the parts list deletes it. Esc / right-click in the editor puts down nothing.
- Shift-click picks up the whole vessel.

## Our Hangar compared (2026-10-22, before plan 348)

| KSP | Hangar before plan 348 |
|---|---|
| node snap only near a node on screen | yes (`SNAP_PX` 36, glow 80) but the ghost fell back to the **default cursor target** (the last part's bottom node, else the last target) whenever the pointer was over the ghost or the cursor had no free point |
| vessel never moves while hovering | **no**: the view stood each group on the floor counting **ghost and free** parts, so a ghost under the vessel lifted it; the ghost then left the pointer, the fallback changed, and the vessel dropped (the reported jump) |
| surface attach on hover | yes (`siteFromHit`, plan 244, ADR 0235) |
| hysteresis | none: the nearest ring within 36 px won every move |
| 1/2/3 Place/Move/Rotate, F local/absolute, Shift fine, C angle snap, X/Shift+X symmetry, R mirror | yes (plans 217, 279) |
| 4 Root | **missing** |
| right-click drops a carried part | **missing** (right-drag orbits) |
| a help overlay of the keys | only in Settings → Controls and the pause help |
| undo | yes |

## Follow-up (plan 357, ADR 0301, 2026-10-22)

- F while placing now switches the symmetry pivot between the parent and the vessel axis (no new lookup: the 2024 guide above).
- The Root tool passes radial and surface links, tilts and offsets where our design can express the turned link. Unlike KSP it still refuses a decoupler that holds by its side (the sim separates by node name) and a part with no free node; draft plan 358.
