# 218 — Hangar: part inspector, action group editor, Δv by body, power budget, pre-flight report

**Plan:** [plans/218-hangar-inspector-groups-report.md](../plans/218-hangar-inspector-groups-report.md) · **Session:** Worker A, 2026-10-19 · **ADRs:** [0225](../decisions/0225-hangar-build-controls-groups-crew-report.md), [0224](../decisions/0224-per-part-settings-fairings-debris.md), [0174](../decisions/0174-part-action-descriptors-calls-compact-snapshot-and-custom-groups.md) · **Research:** 05 §2, 15d §B2, 02 §7–10

## What was done

| Where | What |
|---|---|
| `packages/core` | descriptor `build` and `buildOnly`, `withSettings`, `settingsWith`, `VesselDesign.crew`; API 0.1.83 |
| `packages/sim` | spawn merges settings with `withSettings`; Hangar-only controls stay out of the action snapshot |
| `mods/stock` | engine `limiter` and `gimbalLimit`, docking `crossfeed` as config fields the state starts from; `build` on the limiter, gimbal, crossfeed and chute controls; a tank's `fill:<resource>` |
| `apps/web` editor | `build-settings.ts`, `groups.ts`, `power.ts`, `crew.ts`, `commitDesign`, `pruneGroups`, `situationAt`; delta-v reads the design settings; `checkDesign` takes the seating |
| `apps/web` Hangar | `BuildSettings` in the selection card, `ActionGroupEditor`, `PowerBudget`, `CrewSeats`, the body / altitude picker on the staging panel |
| `apps/web` Launch | starts from the Hangar's seats; repeats the four crew items of the report |
| tests | `state.test.ts` (four boosters, fill), `stats.test.ts` (vacuum and the moon), `checks.test.ts` (the three new items), `groups.test.ts`, `e2e/hangar-inspector.e2e.ts`, `e2e/hangar-groups.e2e.ts` |

## What surprised me

- **A delete broke designs with groups:** core validation refuses a group member on a missing part. The editor now prunes members and seats at every commit and before its resolve check.
- **The sim seats crew on its own:** without a crew list, `load-vessel` puts the first free astronaut in the pod (plan 200). So "no crew" in the design does not mean an empty pod, and the report only warns about crew when the Hangar's seating says so.
- **The stock probe core has its own whip antenna,** so "Probe without antenna" fires only for a mod probe or one with the antenna module taken off; the test does the latter.
- **The fill control leaked into flight:** the sim's action snapshot (and its 8 kB budget test) counted it. `buildOnly` controls are skipped there too.
- **A context-sensitive hook before `state(config)`** (the docking port's `crossfeed`) broke type inference for the whole module; the config type is written out.

## Check against Hangar.dc.html

The new panels use the design's right-column card: 16 px radius glass, a small-caps 9 px heading in muted grey, rows of 10 px text and the 6 px status dot (green when fine, amber when not). The staging header keeps the design's quiet situation label: the picker sits under it as three small segments plus a body select.

## Decisions made (link ADRs)

- ADR 0225. A staging switch per part was left out: staging is the stage list, which the Hangar already edits.
