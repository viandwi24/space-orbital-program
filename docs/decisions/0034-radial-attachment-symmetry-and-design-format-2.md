# 0034 — Radial attachment, part yaw, symmetry and design format 2

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/026-part-visual-follow-ups.md
**Supersedes:** the "stack attachments only, no relative rotation" point of [0016](0016-vessel-design-format-and-protocol.md); the rest of 0016 stands.

## Context

Every vessel is a single column (ADR 0016), so there are no boosters, fins or radial hardware, and a Saturn-style rocket (the human's reference) cannot be built. Adding them touches the design format (core), assembly, mass, collision, drag and separation (sim), the stock parts, the part generators, the VAB editor and the stage delta-v model. This ADR fixes the data model; fins are ADR 0035.

## Decision

1. **Format version 2.** `VesselDesign.formatVersion` is `1 | 2`. Version 2 adds, additively:
   - `parts[i].parent.radial?: { angle: number; y: number }` with `parentNode` equal to the reserved name `"surface"` (`SURFACE_NODE`): the child's `node` touches the *side* of a cylindrical parent at azimuth `angle` (rad, right-handed about +Y from the parent's +X axis) and height `y` (m, relative to the parent's origin, within its height). The parent's surface is not a node: it hosts any number of radial children (two at the same angle and height are refused). A part definition may not use `"surface"` as an attach node name (schema).
   - `parts[i].symmetry?: number`: parts with the same value form a symmetry group made together by the VAB. The sim ignores it; the editor deletes, detaches and moves a group as one.
   `migrateVesselDesign` turns a version 1 design into version 2 (no structural change). The sim and `resolveVesselDesign` accept both versions; radial links and `symmetry` in a version 1 design are refused. The VAB writes version 2 and migrates what it loads.
2. **Part yaw.** Parts may be turned about the vessel's +Y axis, nothing else, so the thrust axis of every part stays vertical. `ResolvedPart.yaw` (rad): a stack child inherits its parent's yaw; a radial child gets `parentYaw + angle + pi - azimuth(child node direction)` so the node faces the parent's axis. The child node must be horizontal (`|dir.y| < 1e-6`) and the parent a cylinder. The child's origin puts that node on the parent's surface point, `parent.position + R(parentYaw)(R(angle)(radius, 0, 0) + (0, y, 0)) - R(yaw)(node.pos)`. Stack links keep the anti-parallel rule, evaluated in the shared part frame (a radial decoupler's `outer` node faces a booster's `radial` node).
3. **Sim.** `PartState.yaw`; the part's orientation is body orientation times yaw (snapshots, hook forces, drag). Colliders carry the yaw, the inertia tensor of each part is rotated about Y (cylinders are unchanged), the separation impulse direction is rotated by the yaw of the part that owns the node. `detach(node)` cuts every attachment on that node (only the reserved `surface` node has several). Separated boosters become debris vessels as before (ADR 0021; throttle 0, so their engines stop).
4. **Staging.** Auto-staging counts stack separators only; a separator whose own link is radial does not deepen its subtree. A level fires: engines and stack separators of that level together (boosters ignite with the core), then the radial separators of the level, then the next level. Stage delta-v ends a burn when an engine runs dry and the next stage separates it, so booster burnout is a stage boundary (`delta-v.ts`).
5. **Resources.** No fuel lines: a radial decoupler has `crossfeed: false`, so a booster feeds only its own engine; the sim and `delta-v.ts` `reach` rules are unchanged.
6. **Content.** `stock.radial-decoupler`, `stock.booster`, `stock.nose-cone`, `stock.fin` (ADR 0035). `PartDefinition.dragCoefficient?` replaces the default `C_d` 0.3 of a part (the nose cone uses 0.12).

## Alternatives considered

- **Radial nodes on every parent (named positions).** Fixed positions only, a node per angle and height; no free placement and no symmetry of arbitrary count.
- **Full 3D part rotation.** Tilted parts would need engine direction in the module descriptor and the Δv model; yaw alone covers boosters, fins and decouplers.
- **Symmetry as a sim concept.** Nothing in flight needs it; it is an editing aid, so the sim ignores it.
- **Bumping to a new format without migration.** Old saves and scripts' designs must keep loading.

## Consequences

- `API_VERSION` 0.1.8 (additive: `dragCoefficient`, the aero capability of ADR 0035).
- The VAB gets a radial placement mode (hover a part side, snap angle and height, symmetry 1/2/3/4/6) and group-aware delete, detach and move.
- Out of scope, draft plan 033: struts and fuel lines, tilted parts, non-cylindrical parents, steerable fins.
