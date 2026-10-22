# 0301 — Symmetry about the parent or the vessel axis; re-rooting rewrites each link from the other side

**Status:** accepted
**Date:** 2026-10-22
**Plan:** plans/357-symmetry-pivot-and-reroot-through-side-links.md
**Builds on:** ADR 0297 (plan 348: the Root tool, stack links only), ADR 0207 (symmetry 1–8, mirror, inherited symmetry), ADR 0235 (surface links), ADR 0258 (tilt and offset)

## Context

KSP's editor has two things plan 348 left out (research note `research/ksp-editor-placement.md`): F in place mode switches the symmetry pivot between the parent part and the vessel, and re-rooting works through any attachment. Our design keeps each part in its parent's frame by one of three link kinds (stack, radial, surface), plus a tilt and an offset, so a link cannot simply swap its ends unless it is a plain stack link.

## Decision

1. **A symmetry pivot.** `SymmetrySpec.pivot` is `parent` (default, today's behaviour: copies turn about the parent's vertical axis, a mirror reflects across the parent's YZ plane) or `vessel` (about the root part's vertical axis through its origin, a mirror across the root's YZ plane). It applies to new placements with ×2–×8 or mirror on a radial or surface target. Inherited symmetry (a parent in a group, ADR 0207 point 2) still wins, as before.
2. **A copy about the vessel axis is a pose, then a link.** The first copy is placed as today; copy k takes its pose turned by 2πk/n about the vessel axis (a mirror: the position reflected, the turn reflected across the plane through the part's attach node and its up axis, so the mirrored part's node still faces in). It hangs by a surface link on the vessel part whose shape its attach node touches (the nearest surface when several do), with the tilt that gives exactly that turn. A copy whose node touches no part is left out. When the parent stands on the vessel axis the two pivots are the same, and the parent path (radial links) is used.
3. **F while placing.** A new carry action `symmetryPivot`, F by default, toggles the pivot while a part rides the cursor; with nothing held F still frames the vessel. The tool pill shows a Parent/Vessel toggle in the Place tool, and the context chip says the pivot when there is more than one copy.
4. **Re-rooting rewrites each link on the path from the other side.** For each hop child C → parent P (the old link), P now hangs on C:
   - a stack link stays a stack link on the same two nodes; P's tilt is the inverse of C's and its offset is C's offset expressed in C's axes and negated;
   - a radial or surface link becomes a surface link of P on C at the point where C touched P (C's own attach node), with P's free node facing it, a tilt for the exact turn and an offset for the distance from that node to the touch point.
   The new root loses its tilt and offset. Struts and fuel lines on the path are still refused.
   The sim separates by node name (`splitVessel`), so a side link is not turned round when the old child is a separator cutting at the node it touched with (the stock radial decoupler cuts at `radial`) or either part is a separator cutting at its side surface: that re-root is refused (`separator`) rather than leaving a decoupler that no longer lets go. A side link whose old parent has no free node left is refused too (`path`). A booster on a radial decoupler is therefore not yet a root; an inverse side link in the core (the child touches the parent's node with its own surface) would allow it, draft plan 358.
5. **The pose check decides.** The new design must resolve, and every part's position and turn relative to the new root must equal the old ones (1e-6 m and rad); otherwise the re-root is refused and nothing changes. A new root that is tipped relative to the vessel's vertical is refused (the vessel would lie down); one turned only about the vertical is allowed and the vessel turns about its axis with it, since a design has no orientation of its own.

## Consequences

- Fins and boosters placed on a side stack can be spread around the whole vessel in one placement.
- A re-root through a part on a face, a radial part whose parent has a free node, or tilted and moved stack parts works; the reversed side links are surface links with offsets (format 4), which the Move tool shows as the part being moved from its touch point. A booster on a radial decoupler is refused with a notice that says why.
- Separation follows the tree, as before: after a re-root a decoupler drops the side that now hangs on it, as in KSP.
