# 0144 — The flight HUD in the refs layout: where our extra controls go and what shows before its data exists

**Status:** accepted
**Date:** 2026-10-17
**Plan:** [088](../plans/088-ui-stage-2-flight-hud.md)
**Builds on:** ADR 0107 (refs visual language, stage 2), ADR 0026 (HUD architecture: 10 Hz model, per-frame canvas), ADR 0063 and 0091 (touch, tablets), ADR 0143 (worlds)

## Context

The refs `Main` screen fixes the flight HUD: world capsule and time control top left, toolbar top right, a 390 × 262 navball module bottom centre (176 navball, vertical-speed arc, heading chip, 7-mode SAS pod, SAS/RCS toggles, VEL/ALT), staging bottom left, crew bottom right. Our game has more than the mock in some places and less in others:

- 10 SAS modes (maneuver, target and anti-target beyond the mock's 7).
- 9 warp steps, 1 to 100 000 (the mock draws 8 segments for 1 to 10 000).
- A script panel, a controls overlay, and resources, target and orbit cards, which have no slot in the mock (the dock, plan 112, and the vessel panel, plan 111, will hold them).
- No RCS, no crew data, and no camera modes yet.

E2E tests and the tutorial depend on the existing labels and test ids (`sas-*`, `hud-warp`, "Faster time warp", "Script panel", `.deck`, `.tr` holding Target).

## Decision

1. **Layout as the refs**, with sizes in rem so the UI scale applies (ADR 0140): margins `--margin-hud`, the capsule row top left, the toolbar top right, staging bottom left, the navball module bottom centre with the ball itself centred, the crew placeholder bottom right. The navball module keeps the class `deck`; the ball is 11rem (176 px) and 9rem on screens 800 px tall or less, as before.
2. **SAS pod: the mock's 7 modes in the pod, our 3 extra beside it.** Hold sits in the centre, and prograde, retrograde, normal, anti-normal, radial out and radial in sit around it at the mock's positions. Maneuver, target and anti-target form a small column next to the pod. Every button keeps its `sas-*` test id and label; `SAS_BUTTONS` is unchanged.
3. **Time control keeps 9 segments** (one per `WARP_STEPS` step, 1 to 100 000), the `hud-warp` readout (`Nx`), and the slower and faster buttons (keyboard `,` and `.`, tablets, tests). Play/pause opens the pause menu, which is what pausing is today.
4. **What has no data yet shows as disabled, never as fake values:**
   - RCS toggle, disabled ("No RCS yet").
   - Toolbar Camera, Dock, Vessel and Crew, disabled ("Comes with plan 112/111/108").
   - Crew panel bottom right: `[—]` and the line "Crew comes with plan 108". It is hidden while the touch controls show, because their cluster owns that corner (ADR 0063).
5. **Our extra panels stay, until their homes exist:** the toolbar keeps Script and Controls between the panel group and Menu. Resources, Target and Orbit stay in the right column below the toolbar (`.tr`). The maneuver editor docks above the navball module, as in the mock. The Staging and Nav toolbar buttons show and hide their panels, with the 4 px dot.
6. **Navball monochrome**: light grey sky `#DCDFE4`, dark grey ground `#26282C`, white horizon, grey ladder. The fixed reticle is white over a dark outline. Markers use the accent for prograde, retrograde and the maneuver node, `--danger` for the target pair, and light grey for the others; the shape still tells them apart, so colour is never the only cue.
7. **World capsule**: the active world's name and `MODE · STOCK SYSTEM` (the record's preset label). Its home button leads to the main menu until the Space Center (091) exists.

## Alternatives considered

- **Drop the three extra SAS modes from the pod** — rejected: maneuver and target holds are part of the flight model and the tutorial.
- **8 warp segments as drawn** — rejected: 100 000× is the rate a long transfer needs.
- **Move Resources, Target and Orbit into a temporary dock now** — rejected: plan 112 builds the dock; two docks in two plans would be thrown away.

## Consequences

- `navball-draw.ts` takes the monochrome theme from tokens (`--ball-*`, `--ball-line`, `--ball-text`, `--ball-reticle`).
- `mobile.e2e.ts` and `ui-scale.e2e.ts` keep their selectors (`.deck`, `.tr`, `.bl`, `.tl`).
- Plans 108, 111 and 112 replace the placeholders and take the extra cards out of `.tr`.
