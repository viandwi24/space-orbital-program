# 0221 — Hangar carry details: drag to carry, empty hand after a place, mirror plane, carry keys

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/217-hangar-carry-loop.md
**Builds on:** ADR 0207 points 1–4 and 11 (Hangar interaction model), ADR 0029 (editor state, loose assemblies), ADR 0034 (symmetry groups), ADR 0071 (tilt), ADR 0061 and 0206 (key table)

## Context

ADR 0207 sets the carry loop, inherited symmetry, the turn keys and the turntable. It leaves open how a placed part is picked up when a click already selects it, what the hand holds after a place, where a mirror pair reflects, how WASD reach a carried part when A and D already detach and save sub-assemblies, and how a mirror group is stored.

## Decision

1. **Drag to carry.** Pressing on a placed part and dragging picks it up with what hangs on it (and its symmetry group). A plain click still selects, so the selection card, the keyboard carry (M) and the screen-reader path stay.
   - Letting go places the part on the ring or side under the pointer.
   - Letting go over the catalogue deletes the part (one undo step).
   - Letting go anywhere else leaves it on the floor as a loose assembly.
   - A drag from empty space orbits as before. Shift-drag pans.
2. **Empty hand after a place.** A click that places a catalogue part, a sub-assembly or a copy disarms, as in KSP. A catalogue click while carrying or copying puts the thing back (deletes a carried part).
3. **Alt-click copies** the subtree onto the cursor. The copy keeps its inner symmetry groups and tilts; its root leaves its group. The touch chip "Copy" does the same for the next tap.
4. **Symmetry 1–8 and mirror.**
   - X steps the count up and Shift+X steps it down. R toggles mirror.
   - A mirror pair reflects across the vessel's YZ plane: the azimuth `a` becomes `π − a` (azimuth is `atan2(−z, x)`). The mirrored copy's tilt flips its x and y turns.
   - A fixed plane keeps the result independent of the camera.
   - The design stores `mirror: true` on the reflected members (an additive field, any format version; the sim ignores it). No format bump.
5. **Inheritance.** A radial part placed on a member of a symmetry group goes on every member, at the same spot in each member's frame. On a mirrored member the spot's angle is negated. The count setting applies only to a parent without a group. All copies are one undo step.
6. **Carry keys in their own scope** (`carry`): W/S pitch, A/D roll, Q/E yaw (90°, Shift 5°), Space resets, C toggles angle snap. They act only while something rides the cursor, so they may share keys with the Hangar's own. The turn is the carried root's tilt (ADR 0071) and placement keeps it in the same undo step.
7. **Turntable:** the wheel moves the target up and down (`raise`). Shift, Ctrl or a trackpad pinch zooms. A middle click centres on a part (`focus`). Today's limits stay.
8. **Picking returns the face normal** in the group frame (`worldNormalOf`), so a side attach can follow any face.

## Deferred

- Surface attach on the top and bottom faces and on cones needs a general surface link (point and normal) in the design format. Today's radial sites cover the sides of cylinders and boxes.
- A ghost floating free under the cursor away from any ring: the ghost shows at the nearest or hovered target.
- Shift-click to pick up the whole vessel: Shift-drag keeps panning.

## Consequences

- A test hook `window.__orbitalVab` (read-only: part and ring screen positions, the parts, what is armed) serves the e2e.
- The settings dialog lists a "Carrying a part" mode; the help overlay of the flight leaves it out.
