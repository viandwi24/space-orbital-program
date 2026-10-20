# 0242 — The map like KSP's: orbit styles, vessel icons by type, link colours and remembered filters

**Status:** accepted
**Date:** 2026-10-21
**Plan:** plans/258-map-view-ksp-style.md
**Builds on:** ADR 0158 (the Network layer), ADR 0208 (vessel types), ADR 0118 (the map view), `refs/reverse-engineering-ksp-ksp2/08-navigation-map-vessel-management.md` §2

## Context

The owner's hand test (item 18, screenshot 15) wanted the map to read like KSP's: the active orbit white and the others grey, vessels as icons of their type and not dots, comms links drawn, and filters that choose what shows. Every vessel orbit was one blue and every vessel a yellow dot; the map had no filters (the Mission Center had three layer toggles).

## Decision

1. **Orbit styles** (`renderer/map-style.ts`, pure): four roles. The active vessel's orbit is white and 3 px; the target's (the active vessel's `target` when it is a vessel) is amber and 2.5 px and wins over active; other vessels' are grey and 1.5 px; debris is dim and 1 px. A vessel and its icon share the role's colour. The hover highlight still overrides the colour and adds a pixel. Body orbits keep their blue.
2. **Icons by type.** One stroked glyph per `VesselType` (debris, probe, rover, lander, ship, station, base, plane, relay, EVA, flag) on the interface icons' 24-grid, drawn once per type to a small canvas (a white glyph on a dark outline) and used as the texture of a sprite tinted by the role. A vessel without a type draws the ship. In a test or without a DOM the sprite is a plain tinted square.
3. **Link colours.** The Network layer's lines take CommNet's colours: green for a full link, yellow for a weak one (a margin under 6 dB at the ladder's first step), orange for a partial one. Each vessel's line already runs to its first hop, so a relay chain is drawn hop by hop. No new comms rule.
4. **Filters** (`apps/web/lib/map`): four layers (orbit lines, comms links, ground stations, labels) and one switch per vessel type, as a chip row under the map's tabs, with the types in a menu under "Vessels n/11". A vessel of a type that is off has neither icon nor orbit, except the one being flown. The value is saved (`orbital.map.filters`, a damaged value falls back per field) and applied when the flight starts and when it changes. The renderer takes the hidden vessel ids and the target through `setMapLayers`.

## Consequences

The Mission Center page keeps its own three layer toggles and the old yellow dots' replacement (it shares the scene, so it shows the icons and styles; its filters are not these). A type guessed wrongly by the sim is hidden with its guessed type. Labels here are the apsis and node labels of the flight map.
