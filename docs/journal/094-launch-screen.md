# 094 — Launch screen: site, pad or runway, design, crew

**Plan:** [plans/094-launch-screen.md](../plans/094-launch-screen.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0150](../decisions/0150-launch-facilities-from-buildings-surface-placement-and-the-launch-choice.md) (new), [0097](../decisions/0097-sites-space-center-in-3d-free-grid-bases-and-range-safety.md), [0115](../decisions/0115-building-grid-placement-rules-and-the-legacy-layout.md), [0142](../decisions/0142-sites-terrain-seed-zones-and-placement.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `lib/launch/launch-model.ts` | `facilitiesOf` (active buildings that provide `launch-pad` or `runway`, footprint centre, the level's mass limit), `accepts`, `placementOf` (surface placement through `padLatLon`), the one-flight launch choice (`orbital.launch`) |
| `routes/launch` | facility list, the designs it accepts (the Hangar's draft and the library's vessels), seats with a note until 108, mass, cost and parts, "Launch from pad" / "Roll out to runway", Edit in Hangar |
| VAB | Launch opens `/launch`; Shift+Launch goes straight to the flight |
| flight | `FlightOptions.placement`; the page takes the launch choice once and `load-vessel` carries it |
| tests | `launch-model.test.ts` (5: Legacy pad at the origin, small pad by mass, runway takes all, footprint centre to lat/lon, planned and other buildings left out, the choice travels once); e2e `launch.e2e.ts` (+1: Hangar, Launch, flight, landed on the pad); `support.ts` passes through `/launch` |

## What surprised me

- **Built pads are not `Site.pads`.** The sim places at `site.pads[i]`, a list building a pad does not extend; the screen computes the building's spot and loads at that surface position (ADR 0150 point 2), so no protocol change was needed.
- **No runway placement and no aircraft yet:** the runway accepts every design and the vessel stands at its centre; aircraft rules come with a later plan.
- **The roster lives in a running world.** Seats show as `[—]` with a note; assignment comes with the Astronaut Complex (108).
- The e2e helper every flight test uses now clicks through the Launch screen; nothing else in those tests changed.
