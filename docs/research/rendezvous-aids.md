# Research: rendezvous aids (plan 057)

Checked 2026-10-17. The official KSP wiki pages (`wiki.kerbalspaceprogram.com/wiki/Navball`, `.../Hohmann_transfer_orbit`) answered "Access Denied" (an Anubis bot wall) to the fetch tool; the facts below come from the pages the search returned and Wikipedia.

## Navball in target mode

- Source: <https://wiki.kerbalspaceprogram.com/wiki/Tutorial:_Docking_Is_Easy> and <https://forum.kerbalspaceprogram.com/topic/144102-prograde-and-retrograde-change-when-a-target-is-selected> (search excerpts, 2026-10-17).
- The speed readout above the ball cycles between Orbit, Surface and Target. In Target mode the number is the speed relative to the target and the **prograde and retrograde markers are relative to the target**: prograde is the direction the vessel moves relative to it, and burning along retrograde to zero the relative speed leaves the two at rest relative to each other.
- A **target marker** (towards the target) and an **anti-target marker** (opposite) appear whenever there is a target. Prograde on the target marker means heading straight at it.
- Official procedure (Navball page, via search): match orbits in Orbit mode, inside about 1 km switch to Target and burn retrograde to zero relative speed.
- Orbital's choice (ADR 0084): same conventions. Target mode replaces the prograde pair with `target-prograde`/`target-retrograde` glyphs so a player can see which reference is in force; target and anti-target are always shown with a target.

## Hohmann transfer and phase angle

- Source: <https://en.wikipedia.org/wiki/Hohmann_transfer_orbit> (2026-10-17).
- `dv1 = sqrt(mu/r1) (sqrt(2 r2/(r1+r2)) - 1)`, `dv2 = sqrt(mu/r2) (1 - sqrt(2 r1/(r1+r2)))`, transfer time `pi sqrt((r1+r2)^3 / (8 mu))` (half the transfer ellipse's period).
- The target must lead the vessel at departure by `alpha = pi - w2 * tH`, `w2 = sqrt(mu/r2^3)` (for an outward transfer; for an inward one the target must trail by `w2 tH - pi`, the same formula with a negative sign). Between windows the phase angle changes at `w1 - w2`, which gives the wait.

## Closest approach on the map

- KSP draws "Closest Approach" markers for the vessel and the target (two markers, one on each orbit, with the distance) and lets a click on a body or orbit target it ("Set as Target"). These are the conventions Orbital follows (ADR 0084): a marker pair joined by a line label, the distance in the label.

## Relative nodes and plane change

- Where two orbit planes cross is along `n1 x n2` (the line of nodes of one plane relative to the other); a plane change there costs `2 v sin(di/2)` for a circular orbit, exactly the difference of the rotated velocity in general. Standard textbook result (Vallado, Fundamentals of Astrodynamics, plane-change chapter); implemented and verified numerically in `packages/kepler/test/rendezvous.test.ts`.
