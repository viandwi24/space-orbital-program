# 0078 — The re-entry plasma shell follows the vessel's silhouette; the thresholds follow the home body's speeds

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/040-effects-and-assets-3.md

## Context

Plan 033 coloured the shock layer by speed but left it a sphere sized by the stack's lateral reach (journal 033). Draft 040 feared a per-frame silhouette projection on the GPU against the budget of plan 039. Separately, measuring the glow showed it was invisible in a normal return: `PLASMA_FLUX_START` 1e5 and `PLASMA_FLUX_FULL` 2e6 W/m^2 came from Earth-scale entry speeds, but the home body (radius 600 km, mu 3.53e12 m^3/s^2) is entered from orbit at 2.4 km/s. A two-dimensional ballistic entry with the sim's Sutton-Graves law (ADR 0023), scale height 5.6 km, from 70 km at 2.3 km/s gives a peak stagnation flux of 1.2e5 to 1.4e5 (ballistic coefficient 500 kg/m^2), 2.2e5 to 3.3e5 (1 500) and 3.6e5 to 5.5e5 (4 000), for flight path angles of 3 to 20 degrees (peak between 14 and 30 km). On the old scale that is an intensity of 0.0 to 0.2, and under the 0.02 visibility cut for the lighter vessels.

## Decision

1. **Shape.** `silhouetteProfile` reduces the stack to a radius profile along the airflow: each part is the cylinder of its physics shape (`PartShape`: cylinder radius and half height; a box uses its wider horizontal half side), turned by its orientation; the stack is cut into 10 slices from the windward end; a slice's radius is the largest of (distance of a part's axis from the stack's centre axis + the part's radius) over the parts whose range overlaps it, evaluated at both ends of the part's axis inside the slice (the farthest point of a segment from an axis is at an end), so a boosters-and-nose stack is wide where the boosters are and a plate across the flow is as wide as it is long. The centre axis is the centre of the lateral bounding box.
2. **Shell.** `shellRings` pushes the profile out by the shock stand-off and closes it with a blunt cap and a tail, 17 rings of 24 segments, rebuilt each frame the shell shows (CPU only: 8 to 10 microseconds for a 40-part stack, measured in `plasma-shape.test.ts`; no extra pass). The stand-off at the nose is Billig's sphere correlation `delta / R = 0.143 exp(3.24 / M^2)` (gamma 1.4; Mach held at 1.5 or more) times the radius of the first slice, times a visual gain of 2.5 (the glow is a shock layer with thickness, not a line), growing to 2.5 times that on the flanks. The Mach number uses 340 m/s. The shell material is the same; its fragment shader keeps the windward weighting and the rim glow of ADR 0047 (the weighting narrowed, the gain lowered) and fades the shell towards the tail so its aft rings do not float as patches; the mesh is a lathe with analytic normals. The wake now starts inside the stack, behind the shell, and is dimmer. Without part data the old ball is drawn.
3. **Thresholds.** `PLASMA_FLUX_START` 5e4 and `PLASMA_FLUX_FULL` 6e5 W/m^2: a 2.3 km/s return glows at intensity 0.19 at 30 km, 0.48 at 25 km, 0.91 at 20 km and full at 15 km (pinned in `blackout.test.ts`), so the shell shows over the whole range of returns above. The colour by speed (`ionisationColour`) is unchanged: it is a function of speed in Earth units and returns deep orange at 2.4 km/s, which is right for a re-entry that slow.

## Alternatives considered

- **Projecting the silhouette on the GPU** (render the vessel to a small target, read the contour): a pass per frame and a stall; the part list already is the silhouette.
- **A convex hull of the parts' bounding boxes**: a hull fills the notches between boosters and the core, which is where a real shock sits well off the surface; the profile is closer, at a lower cost than a hull.
- **A per-part shell (one bubble per part)**: overdraws and shows seams.
- **Leave the thresholds**: a plasma shape nobody can see.

## Consequences

- A re-entry now glows in ordinary returns; the heating, which the sim computes, is unchanged. Plasma of a vessel with long thin parts across the flow (wings, struts) bulges around them; thin fins add their span.
- The shell is rotationally symmetric about the stack axis: a tilted stack (a capsule at an angle of attack) is drawn symmetrically about the airflow, not about the body, which is the symmetry the flow has.
- The 2.5 gain and 340 m/s are look constants, not measurements.
