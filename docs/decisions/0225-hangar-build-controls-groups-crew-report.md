# 0225 — Build-time controls, Hangar action groups, crew seats and the pre-flight report

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/218-hangar-inspector-groups-report.md
**Builds on:** ADR 0224 (per-part settings), ADR 0205 (shared inspector), ADR 0174 (action groups in the design), ADR 0109 (control needs a command source), ADR 0152 (crew at launch), ADR 0148 (verdict levels), ADR 0214 (power budget)

## Context

Plan 219 gave design parts a `settings` field. The Hangar still could not set an engine's limiter, a tank's fill or a chute's mode, and the controls that set them in flight are descriptors with no idea of the Hangar. Custom action groups existed in the design format with nothing to edit them. Crew could only be seated on the Launch screen. The pre-flight checks did not know about crew, antennas or parachutes.

## Decision

1. **A descriptor names its config field.** `PartActionDescriptor.build` is a field name or a path in the module config. The plan's `phase` field (flight, build, both) was not needed: a control with `build` acts in both, and `buildOnly: true` keeps a Hangar-only control (a tank's fill) out of flight. A trigger takes no `build`.
2. **One module list for both places.** The Hangar reads each part's descriptors with `describeModule(module, withSettings(base, own))`, the state coming from `state(config)`, so a module whose state starts from the field shows the built value. The Hangar draws the same `ControlRows` as the flight inspector (test ids `build-<index>-<control>`). It does not reuse the `PartInspector` panel itself, which is about a live entity (pin, highlight, control point).
3. **The edit.** `settingsWith` writes the top field of the path whole, from the current config with the value set inside, so `contents.<resource>.amount` keeps the other resources. The new config is parsed before the edit lands: a value the schema refuses (more fuel than the tank holds) is refused with the reason. It goes to every member of the symmetry group that has the module, unless "Only this part", as one undo step.
4. **Stock fields (starting values):**
   - engine `limiter` and `gimbalLimit`, 0..1, default 1;
   - docking port `crossfeed`, default true;
   - the parachute's existing `mode`, `minPressure` and `deployHeight`;
   - a container's `contents.<resource>.amount`.
5. **Δv and TWR by body and situation.** The Hangar picks a body (home first, no star) and sea level, an altitude or vacuum. Pressure is `p₀·exp(−h/H)`, none above the air or on an airless body. Gravity is `GM/(R+h)²`. The numbers come from the same `stageDeltaV(model, 0, pressure)` the HUD's body picker (plan 224) uses. A body with no air gives the vacuum figures.
6. **Action groups in the Hangar.**
   - Stock groups follow the controls' `group` and are shown, not edited.
   - A part's switches and triggers can join Custom 1–10. The edit goes to the symmetry group unless "Only this part" and is one undo step.
   - An emptied group leaves the design.
   - Every editor step drops group members and seats on parts the design no longer holds (delete, detach), so a delete never makes the design invalid.
7. **Crew seats in the design.** `VesselDesign.crew` (`{ member, part }[]`, additive, any version) holds the Hangar's seating from the world's available roster. The Launch screen starts from it, for members still available, and the sim ignores it. Without a list the sim seats the first free astronaut (plan 200), so the report treats a pod as crewed then.
8. **The report's new items** (warnings, so Launch asks once):
   - **No control source:** a pod counts only with someone seated, when the seating is known.
   - **Pod without crew** (caution): seats are known and none of them is in a pod.
   - **Probe without antenna** (caution): uncrewed control sources and no part with an `antenna` hook.
   - **Crewed vessel without a parachute** (caution): only with the seating known, so older designs without a chute stay "go". A part counts as a parachute by its control in the `stock.parachutes` group.
   - The Launch screen repeats these four, worked out again as seats change.
9. **Power budget:** plan 208's `powerBudget`, per kind of part and in total, day and night, with the night reserve of the batteries.
10. API_VERSION 0.1.83 (additive): `build`, `buildOnly`, `withSettings`, `settingsWith`, `VesselDesign.crew`.

## Deferred

- Group labels other than "Custom N", and editing stock group membership.
- A staging switch per part (the plan's "staging switch"): staging is the stage list, which the Hangar already edits.
- Seat-by-seat placement: a click seats a member in the first free seat, as on the Launch screen.

## Consequences

- A mod module gets Hangar settings by adding `build` to its descriptors and starting its state from that field.
- A design file can now hold crew ids. Another world's ids are ignored at launch.
