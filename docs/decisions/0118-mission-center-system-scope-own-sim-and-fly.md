# 0118 — The Mission Center: the map's system scope, its own sim from the world's save, and what Fly can fly

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [113](../plans/113-mission-center.md)
**Builds on:** ADR 0102 point 6 (Mission Center), ADR 0107 (refs UI), ADR 0050 (saves), ADR 0143 (worlds in the client), ADR 0173 (trajectory provider), ADR 0179 (comms network), ADR 0117 (Space Center)

## Context

Plan 113 shows the whole system with every tracked object, the upcoming events with warp-to, and a Fly action. The map view already draws an orbit line and a marker for every vessel of the snapshot and the orbits of the moons, but it always looks at the active vessel's sphere and has no way to mark one object. Every route starts its own sim Worker (the flight, the Space Center); there is no shared sim. A save carries one design, the focus vessel's, and the flight HUD needs the focus vessel's design for staging and part names.

## Decision

1. **Route and sim.** `/mission-center?load=<saveId>` starts a sim Worker from that save; without `load` it takes the newest save of the active world, and with none the world's start info (a system without vessels). The sim runs here: warp and warp-to act on it.
2. **Renderer, system scope.** `Renderer.setMapScope('vessel' | 'system')`: `system` anchors the map at the root body and frames the system (start distance three times the largest apoapsis of a body with a parent, the far limit fifty times; a system of one body keeps the body limits). `setMapHighlight(key | null)` draws the selected vessel's marker larger and its orbit and the selected body's orbit in the accent colour (`vessel:<id>` or `body:<id>`, the keys of `map-pick.ts`). `setMapLayers({ orbits })` hides or shows every orbit line. Nothing else is new in the renderer.
3. **Labels, network and selection are HTML/SVG over the canvas,** placed with `Renderer.project`: object labels, comms links (a line from each linked vessel to its station, from `Snapshot.network`) and the click pick through `pickTarget`.
4. **Upcoming** lists, in time order, every vessel's maneuver nodes and its next sphere-of-influence change (the trajectory provider's first segment that ends in a transition, horizon from `predictionHorizon`). Warp-to sends `{ type: 'warp-to', time, factor: 100 000 }` with `time` the event time for a sphere change and the node time minus the maneuver panel's lead for a node. Contracts show the started objectives with progress until plan 099 adds deadlines.
5. **Fly flies the save's focus vessel only.** It collects the Mission Center's sim as the world's autosave (the time spent here is kept) and opens `/flight?load=<id>`. Another vessel's card says why it cannot be flown yet: switching to a vessel needs its design, and only the focus vessel's is saved. A follow-up keeps every launched vessel's design.
6. **The switch.** In the flight's map view a `Map | Mission Center` switch writes an autosave and opens the Mission Center with it; the Mission Center's `Map` tab is Fly. The Space Center's Mission Center building opens `/mission-center`.

## Consequences

- Plan 115 adds relays and the link budget to the same Network layer; plan 099 adds contract deadlines to Upcoming; 096 adds construction done.
- Changing the vessel in focus waits for per-vessel designs (follow-up draft).
- The Mission Center costs a sim start each time it opens (about the flight's load time).
- At the system scope a fleet in low orbit is a few pixels across: vessels within 24 px of each other share one "N vessels" label (the page's `clusterLabels`), and zooming in splits it.
