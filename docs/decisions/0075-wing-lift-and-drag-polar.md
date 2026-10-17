# 0075 — Wing lift: finite-wing slope, stall and induced drag in `stock.wing`

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/041-aero-and-structure-extras.md
**Builds on:** ADR 0035 (`airVelocity`, the fin law), 0042 (stability read-out), 0045, 0046 (fin damping), 0071 (tilt).

## Context

`stock.fin` is a flat plate with a fixed lift slope and a cross-flow term (ADR 0035): good for a rocket's stabilising fins, but it has no stall, no induced drag, and its force acts along the plate normal only, so a craft built of fins cannot glide: the resultant of a normal force has a large drag component at any angle. A wing is a different model.

## Decision

`stock.wing` (module in `mods/stock`, no sim change: it uses `airVelocity`, `applyForce`, `centreOfMass` like the fin). Sources and the constants that could not be confirmed online: `research/wings-struts-fuel-lines.md`.

- **Geometry**: as the fin: plate in the part's X-Y plane, span along X, chord along Y (leading edge towards +Y, the nose), normal Z. Config: `area` (m2), `aspectRatio` of the wing the part is half of (`b^2 / S` of the pair), `efficiency` `e` (0.85), `stallAngle` (15 degrees), `parasiteDrag` `C_D0` (0.02), `crossflow` (1.2), `centre` (the aerodynamic centre: a quarter chord behind the leading edge), `damping` (0 by default: see below).
- **Lift slope** `a = a0 / (1 + a0 / (pi e AR))` per radian with `a0 = 2 pi` (lifting-line theory); for the stock wing pair (AR 6, e 0.85) 4.513.
- **Coefficients** at the section angle of attack `alpha = atan2(v_z, |v_y|)` (only the flow in the Y-Z plane counts, so a spanwise flow makes neither lift nor drag): `C_L = a alpha` up to the stall angle, then `C_L = C_Ls (1 + cos(pi t)) / 2` with `t` running from the stall to broadside, so the lift peaks at the stall and falls to zero at 90 degrees; `C_D = C_D0 + C_L^2 / (pi e AR)` plus the broadside plate drag `crossflow sin^2 alpha` blended in over 0.1 rad past the stall.
- **Force** (`wingForce`): lift `q S C_L` perpendicular to the section flow (towards -Z for a positive angle, so the force pushes against the face the plate moves into), drag `q S C_D` along it, `q = 1/2 rho V_section^2`. Applied at `centre`. Flying tail first gives the same lift (the lift direction follows `|v_y|`).
- **Damping**: the quasi-steady rotational damping is there by construction (`airVelocity` includes `omega x r`). The extra factor of ADR 0046 is off for wings: a wing sits metres from the roll axis, where `(1 + damping) dt c / I < 1` fails for the fin's value of 30 (measured: the 6 t glider's attitude oscillated from step to step). A mod may set it.
- **Incidence** is a tilt (ADR 0071). The editor's stability read-out counts a wing through the `lift` descriptor (area, slope, crossflow, centre), as it counts a fin; its calibre is now the widest cylinder, so a wide wing does not change the margin thresholds of a rocket.
- **Part drag**: the wing part declares `dragCoefficient` 0.05 (a thin section) so the box faces do not double-count the module's parasite drag.

## Measured (plan 041, `packages/sim/test/glider.test.ts`)

A 5.9 t craft (pod, full small tank, two wings of 3 m2 at 0.15 rad incidence, two tail wings with none) at 3 km: lift equals the weight within 3 percent at the hand-computed speed (194 m/s); the energy-corrected glide ratio over 30 s is 5.13 against 4.91 predicted from the polar (parasite drag area 0.656 m2 by hand, induced drag from the lift coefficient), inside the 15 percent bound; the nose stays within 1.2 degrees of the air velocity. The wing alone has `(L/D)max = 1/2 sqrt(pi e AR / C_D0)` = 14.2.

## Alternatives considered

- **Extend `stock.fin`**: a different law (stall, polar) in the same module would change every finned rocket's flight; fins stay as they are, pinned by determinism tests.
- **A `lift` field in the part handled by the sim**: only this model, and the sim would know aerodynamics (ADR 0035 rejected the same).
- **Post-stall by the flat-plate normal force**: simpler, but the lift would keep rising for a short interval beyond the stall and the drag polar would be wrong; the blend is two lines.

## Consequences

- A craft with wings, a tail and the right incidence flies without commands; the rest of a plane (landing gear, runway, trim, flaps, speed and angle-of-attack read-outs) is draft 063.
- The glide is stable only while the tail is behind the centre of mass; the VAB read-out says so as it does for fins.
