# 0071 — Design format 3: connector parts (struts, fuel lines), tilted parts, radial attachment to boxes

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/041-aero-and-structure-extras.md
**Builds on:** ADR 0015 (resource routing, `crossfeed`), 0016, 0018 (one rigid body), 0033 (descriptors), 0034 (format 2, yaw, radial links), 0050 (designs in saves).

## Context

Plan 033 left four building blocks out. Three of them change the design format and the sim's idea of a part: a part joined to a second part elsewhere on the vessel (struts and fuel lines), a part turned about more than the vertical axis (a canted engine, a wing with incidence), and a radial attachment to something other than a cylinder (a control surface on a wing). The sim holds a vessel as one compound rigid body (ADR 0018), so a strut cannot stiffen anything; what it needs is a place in the part graph, a mass, and a rule for what happens when the vessel splits.

## Decision

1. **Format version 3** (`VesselDesign.formatVersion` `1 | 2 | 3`). Additive: `parts[i].tilt?: { x, y, z }` (rad), `parts[i].link?: { index, angle, y }`, and radial links to box parents. `migrateVesselDesign` turns versions 1 and 2 into 3 without a structural change; `resolveVesselDesign` accepts all three and refuses the new fields in an older version. The VAB writes version 3. A frozen version 2 design and the version 1 designs resolve to identical parts after migration (tests).
2. **A connector is a tree part with a link.** `PartDefinition.connector?: { feeds?: boolean }` marks a strut (`{}`) or a fuel line (`{ feeds: true }`). It hangs on one part like any radial part (its tree parent, so it has mass, a collider, drag and a place in the staging and the editor's undo) and its design entry carries `link`: the surface point (`angle`, `y`, the radial parametrisation of ADR 0034) of a second part. A connector without a link, a link on a part that is not a connector, a link to itself, to a missing part or to another connector, and a height outside the target are refused. `ResolvedPart.link` is the far point in the vessel axes.
3. **Struts are structural only.** The vessel is one rigid body, so a strut adds no stiffness. It adds its mass and drag and a visible bar. It does not hold a vessel together: a split cuts the tree edges only (ADR 0016), and a link whose two ends end up on different vessels is cleared in the same step (`PartState.link` removed, the stub stays on the side it hangs on). The editor does the same when a part is detached, moved or deleted: a connector with one end outside the subtree is cut and a connector that ends on a deleted part goes with it.
4. **Fuel lines route resources one way.** A fuel line carries propellant from the part it hangs on (its source) to the part it ends on. `reachableParts` visits the sources of the lines that end on a visited part before that part, even when the source has `crossfeed: false` (the line is the explicit connection: a radial booster is a `crossfeed: false` part), then what the source itself reaches (barriers apply from there). Lines are never walked backwards. So a core engine drains its boosters first, in ascending line order, then its own tanks, which is what an asparagus build needs; a booster engine draws only from its own part. Splits clear the link, so decoupling the boosters ends the crossfeed. `apps/web/src/lib/delta-v.ts` mirrors the rule (journal 024) and is tested against the sim's burnout time.
5. **Tilt turns a part about its parent's axes, at the attach point.** The matrix is `Rx(x) Ry(y) Rz(z)` (a vector is turned about Z first). For a stack child `R = R_parent T`; for a radial child `R = R_parent T Ry(facing)`: the tilt is applied before the part turns to face the surface, so two wings on opposite sides with the same tilt are mirror images (the same incidence), not a twisted pair. The position follows by putting the attach points together (`placeStack`, `placeRadial` in `@orbital/core`, which the editor reuses). `ResolvedPart.rotation` is the full rotation and `tilted` says whether it differs from the yaw; `PartState.rotation?` is stored only for a tilted part or its descendants, so every older design and save is unchanged bit for bit. The sim uses it for the collider, the inertia tensor (`R diag R^T` plus the parallel-axis term), forces in the part frame, `torqueDemand`, `centreOfMass`, the separation direction, the snapshot orientation, the lowest point at placement, and drag.
6. **Engines report their axis.** `ModuleInfo.engine.axis?` (part frame, default +Y). Stage delta-v multiplies an engine's thrust by the component of its tilted axis along the vessel's axis: the cosine loss is exact for a symmetric cluster (the sideways parts cancel) and an approximation otherwise (stated in the guide).
7. **Radial attachment to boxes.** The site (`angle`, `y`) is the ray from the part axis: the contact point is where the ray leaves the box rectangle (`surfaceSite`: the distance and the azimuth of the outward normal, equal to `angle` on a cylinder) and the child faces along that normal. A radial child is therefore on a face, not at a corner. `surfaceHalfHeight` bounds `y`. The same parametrisation gives the far end of a link.
8. **Snapshot.** `PartSnapshot.link?: { peer, point }` (point relative to the root origin in the inertial axes, like `position`) lets the renderer draw the bar; it disappears when the link is cut. API 0.1.19 (additive).

## Alternatives considered

- **Connectors as a separate `links` array.** Their mass would need its own accounting in every mass, Δv and stability calculation, and the editor would need a second kind of selectable thing. A tree part reuses all of it. The cost: a connector hangs on one part, so deleting that part deletes the connector (right), and the link end needs its own validation (done in `resolveVesselDesign`).
- **Struts that bind two vessels together across a decoupler.** Would make staging depend on struts; the plan's criterion is that they are cut. Real struts are cut by the stage too.
- **Tilt in the part's own frame.** Radial copies would be twisted pairs (a wing pair with opposite incidence); the editor would need a mirror rule.
- **Fuel lines in both directions, or crossfeed by a flag on the decoupler.** KSP-like fuel lines are one way, and the radial decoupler keeps `crossfeed: false` so a booster feeds only itself unless a line says otherwise.
- **A new format version per feature.** One bump for the three is the smaller migration surface.

## Consequences

- `apps/web/src/lib/editor/state.ts` gains `setTilt`, `planConnector`/`attachConnector` (with symmetry pairing by group) and box radial sites; `scene.ts` feeds `VabScene.links` and `VabPart.rotation`; the renderer draws bars (`ConnectorBars`) in the flight scene and the VAB.
- Strut and fuel-line parts have a fixed mass whatever their length (documented in the guide).
- A tilted part's drag `covered` test still uses the part-frame node directions; accepted (small, conservative).
- Full plane gameplay (landing gear, runway, trim) is draft 063.
