# 0288 — Panel input: the body and the HUD's delta-v; a notice can open a tab

**Status:** accepted (owner's report, 2026-10-22)
**Date:** 2026-10-22
**Plan:** plans/333-rendezvous-readiness-and-next-step.md
**Amends:** ADR 0149 point 2 (panel input), ADR 0287 point 4 (notice)

## Context

The owner engaged nothing: the Rendezvous tab said "The target orbits another body." while both vessels flew near the home planet. The vessel was still climbing (periapsis under the surface), and the sim reports no closest approach in that case, which the rendezvous read as another body. A panel cannot say the true reason: it has the snapshot, not the body's radius, gravity or atmosphere. Its delta-v read-outs showed `[—]` while the program was off for the same reason (the pilot's facts, ADR 0277, exist only inside the sim). And a reason with no way forward leaves the player stuck.

## Decision

1. **`PanelInput.body`** `{ id, radius, mu, atmosphereHeight }` of the active vessel's sphere of influence, and **`PanelInput.deltaV`**, the active vessel's delta-v as the HUD's stage stack shows it, m/s. Both optional: null or absent when the host does not know them. The web host fills them from the content catalogue and the HUD model.
2. **`notice.action?(input)`** returns `{ label, tab }` or null: the host draws a button that opens that tab of the nearest `tabs`.
3. The Guidance Computer checks a rendezvous with one function for the autopilot and the panel: a vessel target; a controllable vessel; both around one body; the vessel not on the ground; its periapsis above the top of the air (2 % of the radius without air), with the numbers; the target not on the ground and in a stable orbit. A low periapsis offers "Open Orbit" (circularize) when the apoapsis is high enough, else "Open Ascent".

## Consequences

- API 0.1.105, additions only.
- The rendezvous no longer relies on the snapshot's `approach` to decide the bodies; it compares the two vessels' spheres of influence.
- Delta-v while off is the HUD's figure (stage stack, the environment the player picked); while flying it is the autopilot's (burning engines, vacuum).
