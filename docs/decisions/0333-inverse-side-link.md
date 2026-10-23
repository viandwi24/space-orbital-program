# 0333 — An inverse side link: a part hangs on its parent's node by its own surface

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/358-inverse-side-link-for-reroot.md
**Builds on:** ADR 0301 (re-rooting through side links), ADR 0235 (surface links), ADR 0034 (radial links), ADR 0258 (design format 4)

## Decision

1. **The link.** A `DesignLink` with a real `parentNode`, `node` `"surface"` and `surface` is an inverse link. `surface.point` and `surface.normal` are in the **child's** frame: the child touches the parent's node with its own surface at `point`, its outward `normal` against the node's direction. The part's `tilt` is the twist about it and its `offset` applies as for any link. It is the surface link the other way round (a surface link has `parentNode` `"surface"` and a real child `node`).
2. **Placement.** `placeInverse` is `placeSurface` with the roles exchanged, so one turn-and-fit serves both. Validation (`resolveVesselDesign`): the parent has the node and it has a direction; the point and normal are finite; the point lies on the child's shape; the node hosts one attachment; no `radial`; `formatVersion` at least 5.
3. **Format 4 → 5.** `DESIGN_FORMAT_VERSION` is 5. The version only adds the link kind, so every older design loads unchanged (`migrateVesselDesign` raises the number); a design with an inverse link and a lower version is refused.
4. **The sim.** Attachments are `{node, peer, peerNode}` as before: the parent keeps its real node (a radial decoupler keeps `radial`), the child's side is `"surface"`. `splitVessel` cuts by the decoupler's own node, so the staging works; the reserved name already meant "horizontal direction to the peer" on a separation.
5. **The Root tool.** When the old child separates at the node it touched the old parent with, the old parent now hangs on that node by an inverse link (`inverseLinkOnto`, the point being where the node lies in the old parent's frame), instead of the refusal of ADR 0301 point 4. Reversing an inverse link writes a surface link of the old parent on the old child by the node it hung by, which the old child's separator node may be. Surface-node separators on either part are still refused, and the pose check of ADR 0301 point 5 still guards every result.

## Consequences

- A booster (or a nose cone above it) on a radial decoupler can become the root and still stage.
- Readers that look up the child's node by name find none for `"surface"` and skip it, as they already do for the surface link's parent side.
- Old games and mods are untouched; only designs the Root tool rewrites become version 5.
