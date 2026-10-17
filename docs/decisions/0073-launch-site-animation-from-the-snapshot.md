# 0073 — A launch site that moves: arms by the vessel's height, steam as a function of time

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/038-water-site-animation-and-devices.md

## Context

The site (plan 025) is a merged static mesh: three swing arms sit on the tower in fixed positions, the tanks are inert, the masts' lamps are painted, the windows are plain glass. The renderer reads snapshots; it must not drive the sim, and the sim has no notion of a tower.

## Decision

1. **The arms follow the vessel, not a countdown.** The target angle of every arm is a pure function of the active vessel's height above the pad (from the snapshot, as the site already knows where the pad is): 0 (extended) on the pad, folded `ARM_RETRACTED` when the vessel is `ARM_CLEAR_HEIGHT` above it, smoothstep in between. The angle on screen slews toward the target in wall time (fast when retracting, slowly when extending: a new vessel on the pad finds the arms coming back), and starts at the target (a save loaded in the air shows folded arms, never a snap). Nothing is sim state: warp and pause just stop or speed the height.
2. **Steam is stateless.** `steamPuff(index, t)` gives position, size and opacity of puff `index` at time `t` as a function (a rise with drag, drift with the wind, growth, fade), so the renderer keeps no particle state. One `InstancedMesh` of camera-facing quads with a soft, depth-tested, non-writing material; vents at the sphere tank's valve and at the tower's foot. The vents die down when the vessel leaves the pad. Steam is not drawn beyond the distance where it is smaller than a pixel.
3. **Beacons and windows follow the clock and the sun.** The mast and tower-top beacons blink red with a short duty share at two phases; they are emissive and take the bloom. A fixed hash picks the lit share of the panes of the buildings; those panes use a second glass material whose emissive follows the floodlight level (`setLamps`): dark by day, warm at night, and no shader recompiles at dusk (the material exists from the start).
4. The driver is `LaunchSite.animate(input)` called from `Environment.update`: input = wall dt, the active vessel's height above the pad (null without one) and the time. The pure maths is `site-animation.ts`.

## Alternatives considered

- **A countdown or ignition trigger from the sim**: no countdown exists, and a trigger would need an event, a state in the sim and a save-format change for a decoration.
- **Time since first lift-off remembered in the renderer**: stateful; a save loaded in the air or a second vessel would need special cases. Height needs none.
- **Particles in `effects/system.ts`**: that module is the structure plan's area and keeps per-particle state; the steam needs neither.
- **A bending hose**: the hoses are rigid on the folded arm; a skinned hose is not worth the cost at the distances the pad is seen from.

## Consequences

- The arms and steam are renderer-only; the sim, the snapshot and the save format are unchanged.
- A few more meshes in the structure set; the arms cast shadows.
- A glTF asset swap of the site remains plan 026's provider interface.
