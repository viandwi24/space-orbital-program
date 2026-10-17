# 0150 — Launch facilities are the site's pad and runway buildings, placed by surface position; the choice travels to the flight

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [094](../plans/094-launch-screen.md)
**Builds on:** ADR 0097 (Space Center, launch facilities), ADR 0115 (building catalogue, cells, `provides`, capacity), ADR 0142 (sites, pads, placement), ADR 0041 (vessel library), ADR 0107 (refs Launch)

## Context

The Launch screen chooses a facility, a design that facility accepts, and crew. Facilities are buildings that `provide` `launch-pad` (capacity: a mass limit in tonnes per level) or `runway`. The sim's `load-vessel` places a vessel at `{ kind: 'site', site, pad }`, where `pad` indexes `Site.pads`, a list that building a pad does not extend; nothing places at a runway, and no design is flagged as an aircraft.

## Decision

1. **Facilities are buildings.** The screen lists the active buildings of the world's primary site that provide `launch-pad` or `runway`, in the site's order, with their level's capacity (`launch-pad`: mass limit in tonnes). The Legacy site lists its Legacy pad.
2. **Placement by position.** A facility's spot is the centre of its footprint (`footprint`, cell centres at `CELL_SIZE`), turned into latitude and longitude on the site's body with `padLatLon`; the flight loads the vessel with the existing `{ kind: 'surface', body, latitude, longitude }`. No protocol change: `Site.pads` stays the sim's default spot for a plain `/flight`.
3. **What a facility accepts.** A pad accepts a design whose wet mass is within its limit; a runway accepts every design until a plan adds aircraft (wheels and a flag), which this screen will then read.
4. **The choice travels once.** Launch writes the chosen design as the draft (as the Hangar does) and the placement under `orbital.launch`; the flight page reads and removes it, so a reload or a later `/flight` starts at the default spot. The Hangar's Launch opens this screen; Shift+Launch keeps the direct path to the flight (testing, quick iteration).
5. **Seats wait for the Astronaut Complex.** The screen shows the design's seats with a note; assigning crew needs the roster, which a running world holds, and comes with plan 108.

## Alternatives considered

- **A `building` field in the `site` placement** — rejected for this plan: a shared protocol change for what the page can compute; revisit when the sim must check facility limits itself (range safety, 127).
- **Add a `Site.pads` entry when a pad is built** — rejected: it ties two lists that would drift; the building is the truth.

## Consequences

- `apps/web/src/lib/launch/` (facilities, filter, placement, the choice), route `/launch`; `FlightOptions.placement`.
- e2e `launchTwoStage` passes through `/launch`.
