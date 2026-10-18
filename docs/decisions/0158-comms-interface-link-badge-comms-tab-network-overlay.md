# 0158 — Comms in the interface: the link badge with its reason, the Comms tab, the Network layer as a page overlay

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [115](../plans/115-comms-tier-1-interface.md)
**Builds on:** ADR 0101 point 5 (every broken link names its cause), ADR 0179 (comms tier 1 model and `Snapshot.network`), ADR 0153 (the vessel panel), ADR 0118 (the Mission Center), ADR 0079 (plasma blackout)

## Context

`Snapshot.network` (plan 114) carries each vessel's link (`to`, `reason`, `control`, `blackout`) and the ground stations. The HUD showed only a blackout badge; the vessel panel's Comms tab was disabled; the Mission Center drew dashed lines for vessels linked to a station. Link budgets come with plan 116, Manual routes with plan 117.

## Decision

1. **One badge, every reason.** With a network, the HUD shows the link badge (`hud/LinkBadge.svelte`): signal bars and "Linked to <station or vessel>", or the reason in the player's words when it is down: Occluded by <body> (`blocked by <id>`), Blocked by terrain, Out of range, Plasma blackout (the old badge's scan lines kept), Antenna off, No antenna. Without a network (comms off) the blackout badge stays as it was.
2. **Bars before budgets.** Until plan 116 gives a link budget, bars are 4 for full control, 2 for partial, none when down.
3. **The Comms tab** (`VesselPanel`): the route (Auto; Manual with plan 117), the hop path (the vessel, then its endpoint), the reason when down, the ground stations with the current one marked, and the vessel's transmitters: the toggle controls of its parts' antenna modules from their descriptors, sent like any part control (ADR 0153). The tab is disabled in a world without a network.
4. **The Network layer is a page overlay, not a renderer pass.** `comms/network-model.ts` turns the snapshot into system-frame lines (one per link, vessel to station or vessel to vessel) and station markers; `projectNetwork` projects them with the view's own `project`; `comms/NetworkLayer.svelte` draws them as SVG, full links green and partial ones amber. The flight map and the Mission Center use the same model and component, as the Mission Center's links and labels already did (ADR 0118). `packages/renderer/src/map.ts` is not changed.

## Alternatives considered

- **Lines in the renderer's map scene** — a renderer API for comms state, a second place where link state is styled, and the map's labels are already a page overlay; the overlay costs one projection per link per frame.
- **Keep the blackout badge and add a link badge** — two pills for one fact (the radio is down); blackout is one of the reasons.

## Consequences

- The crew panel's suit radio stays "no radio" until suit radios (plan 121).
- No protocol or renderer change; the web reads what plan 114 put in the snapshot.
