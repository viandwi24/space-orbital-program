# 0161 — Aeroplanes: wheels as frictionless colliders with sim-side tyre forces, a level runway start, trim, flaps, level-wings, flight read-outs

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [063](../plans/063-aeroplane-gameplay.md)
**Builds on:** ADR 0019 (ground tile, contact readback, impact damage, module colliders), ADR 0071 and 0075 (wings, stall, control surfaces), ADR 0049 (SAS), ADR 0097 and 0150 (the runway building, the Launch screen's "Roll out to runway"), ADR 0174 (part actions), ADR 0026 (HUD)

## Context

Plan 041 made wings fly: lift with stall, induced and flat-plate drag, control surfaces that deflect by the attitude demand, a glider that glides at its polar. A plane cannot take off: every part is a box with the ground's Coulomb friction 0.8 (one value for the whole body), so a craft on the runway does not roll; `load-vessel`'s surface placement stands every vessel nose-up; there is no trim, no flaps, and the HUD reads no angle of attack.

## Decision

1. **A wheel is a frictionless collider; the sim makes the tyre.** A module may declare `wheel(config, state): { offset, radius, width, steer, brake, rolling, grip }` (part frame). The sim adds a box collider for it with friction 0 (a per-shape `friction` on `ShapePlacement`, combined with the ground by the minimum, so the tile's 0.8 does not average in), and after each step reads the wheel's contact points with the ground tile (the readback of ADR 0019). Before the next step, for each wheel in contact, it applies at the contact point: rolling resistance `rolling × N` against the wheel's rolling direction, a side force `−v_side × m_share / dt` limited to `grip × N` (no sideslip below the limit), and braking `brake × grip × N` against the rolling direction. `N` is the vessel's weight shared over its wheels in contact (the tile gives no impulse). The rolling direction is the part's +Y (the nose of a level plane) turned about the ground normal by `steer × yaw demand`. Impact damage applies to wheels as to any part (`impactTolerance`).
2. **Stock gear:** `stock.wheel` (a small wheel, rolling 0.02, grip 0.8, steer 0, brakes) and `stock.wheel-steer` (the same with 20 degrees of steering), with a `brakes` toggle action (descriptor and the stock `brakes` group, ADR 0174) and the gear `deployed` flag.
3. **Aircraft start level on the runway.** A design may carry `aircraft: true` (design format, additive). `load-vessel` places such a design on the surface lying level: the design's +Y (its nose) along the site's north (the axis of an unrotated runway building) and its +Z up, resting on its lowest point. A runway turned by its building rotation needs a heading on the placement: filed as a contract request (the protocol is not in this plan's Touches). The Launch screen offers the runway for aircraft and the pad for the rest.
4. **Trim** is a per-vessel pitch offset in −1..1 added to the pitch demand before the mixer (`trim { vessel, pitch }`, appended to the command union; saved with the vessel). **Flaps** are a wing setting: `flap` 0..1 (0, 0.5, 1 from the `flaps` mode action) adds `flapLift × flap` to `C_L` and `flapDrag × flap` to `C_D`, and lowers the stall angle by `flapStall × flap`.
5. **Level wings** is an SAS mode (`level`): it drives the bank to zero and the pitch toward the horizon (the nose's angle above the local horizontal to zero), with the same controller as `hold`.
6. **Read-outs in the page**, from the snapshot: angle of attack (the nose against the air velocity, the air turning with the body), indicated airspeed (true airspeed × √(ρ/ρ₀) from the body's atmosphere), glide ratio (horizontal over vertical speed, descending only) and a stall warning when the angle of attack is within 2 degrees of the wing's stall angle. Shown by the flight HUD when the vessel has wings and is in air.

## Found while building (plan 063)

- **A tyre takes a quarter of its slip out per step** (`WHEEL_SETTLE`): the contact sits below the centre of mass, so a push there also rolls the craft and the effective mass is well under the wheel's share; cancelling the whole slip in one step overshot and shimmied at ±0.7 m/s.
- **Wheel contacts are kept in the body's own axes**: the flight frame re-anchors on a vessel that has run about a kilometre, and contacts kept in frame coordinates then put the next step's tyre forces 950 m away.
- **`level` may use the whole authority as integral** (`LEVEL_INTEGRAL_LIMIT` 1, other modes 0.5): a craft holds its own steady aerodynamic moment, which left a standing error of 0.1 rad at the shared limit.

## Alternatives considered

- **Per-shape anisotropic friction in the physics backend** — Rapier has no anisotropic Coulomb friction; a cylinder collider that really rolls would need a joint per wheel (a vessel is one rigid body, ADR 0018).
- **Wheels as a module `update` applying forces** — a module cannot see the ground or its contacts; the sim already reads them for damage.
- **A heading field on the surface placement now** — the right shape, but a protocol change outside this plan's Touches.

## Consequences

- Physics backend: `ShapePlacement.friction` (additive). Core: `ModuleDefinition.wheel`, `VesselDesign.aircraft`, the `trim` command, the `level` SAS mode. SDK: the wheel hook and the aircraft flag.
- The tyre model is quasi-static (weight shared, no suspension): good for rolling, braking and holding a line, not for skidding or ground loops.
