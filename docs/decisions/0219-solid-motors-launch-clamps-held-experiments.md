# 0219 — Solid motors, launch clamps and held experiments

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/210-propulsion-and-structure-pack.md
**Builds on:** ADR 0203 points 2, 6 and 7 (solid fuel, SRBs, clamps), ADR 0019 (ground tile), ADR 0178 (experiments), ADR 0045 (articulation)

## Context

ADR 0203 asks for SRBs with no throttle and a limiter, a true solid BST-1, and launch clamps that grow to the pad, hold the rocket, feed EC and release on staging. It leaves open how the sim holds a vessel without stock ids, what flow `none` means for the engine that burns it, how a flying BST-1 in an old save becomes solid, and how the two KSP-style experiments keep their results.

## Decision

1. **Solid mode** on `stock.engine` (`solid: true`): the throttle is ignored (full limiter once lit), shutdown and `setActive(false)` do nothing, and the limiter is fixed once lit. Every engine gets `limiter` (0..1, scales the mass flow, so thrust and burn time), `gimbalLock` and `gimbalLimit` in its state and snapshot. The descriptor shows the limiter and one gimbal limit slider (0 holds the axis); `setGimbalLock` stays an action for groups and scripts, so a 100-part vessel's actions stay under ADR 0174's 8 kB.
2. **Flow `none` is the part itself** (KSP's NO_FLOW), as ADR 0203 point 2 meant: `sources` returns the drawing part, so a motor burns its own solid fuel. Before this, `none` reached nothing.
3. **Numbers** (KSP-like starting points):
   - BST-1: 150 kN, Isp 175/200, 330 u (its old liquid mass);
   - small SRB: 70 kN, 110 u;
   - large SRB: 1.25 m, 300 kN, 870 u;
   - vacuum engine: 60 kN, Isp 85/345;
   - 2.5 m class: two tanks (4.5 t and 18 t full), a 650 kN engine, a decoupler and a heat shield with 480 u of ablator.
4. **Clamps through a generic hook.** `ModuleDefinition.anchor(config, state)`: while true and the vessel has a ground tile, the sim holds the vessel. After each backend step it puts the body back to the pose it had in the body-fixed frame when the hold began, with the ground's velocity (`VesselState.anchor`). Thrust moves it nowhere. Once no part anchors it, the hold ends with the ground's velocity.
5. **Stock clamp** (`stock.launch-clamp`): radial. At the first flight step it measures the ground under the tower's foot (`VesselApi.groundClearance`) and anchors while that is within 40 m. It deposits 20 EC/s into the vessel and detaches its node on staging. The clamp vessel stays held on the pad. The tower is drawn with the new `extend` articulation, which stretches the moving piece (built 1 m long) to the snapshot's `height`.
6. **Save format 10:** a flying `stock.booster` takes the solid engine and container configs. Its liquid fuel and oxidizer become solid fuel at the same fraction full. A test pins the migration's copy of the configs to the stock part.
7. **Held experiments** (`held: true` on `stock.experiment`): the result stays in the part. View is shown by the host from the snapshot. Transmit stores it in the vessel's data storage at the experiment's transmit factor and leaves the part spent. Reset readies it again (no crew needed for now). Recovery credits a held result in full. The goo canister and the materials bay use it. Their base values are small (2 and 4), so the tech-tree pacing holds until plan 231 rebalances it. Tier 3 costs rise by 40 each.

## Alternatives considered

- **A fixed joint to the ground tile** — rejected: the tile is moved under the vessel every step, and a joint to it would fight that.
- **Surface rails while clamped** — rejected: the engines must run (and burn) while held, which needs flight.
- **A Hangar field for the limiter now** — deferred: designs have no per-part settings yet; the limiter is set in flight before ignition until plan 218's part inspector.

## Consequences

- API_VERSION 0.1.79 (additive): `anchor` hook, `VesselApi.groundClearance`, the `extend` articulation.
- ADR 0019's removed pad hold comes back only as a part the player places.
- Plan 218 can add per-part settings to designs and set the limiter and gimbal in the Hangar. A Hangar warning for clamps off a pad belongs in its pre-flight report.
