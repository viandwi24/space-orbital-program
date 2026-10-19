# 0228 — The deep-space dish: model, tracking and station tiers 4–6

**Status:** accepted
**Date:** 2026-10-20
**Plan:** plans/234-deep-space-dish.md
**Builds on:** ADR 0097 (buildings as capabilities), ADR 0115 (site cells), ADR 0117 (site buildings from a list), ADR 0185 (link budget, station apertures), ADR 0222 point 3 (the owner's deep-space dish)

## Context

The owner asked for "a big parabola like in the films, an exact and realistic version". The site draws buildings from generators merged into a few material meshes, which cannot move; the station tier of a site came from the tracking dish only (tiers 1–3), whose apertures were 10, 34 and 70 m: a 70 m dish on a 2 × 2 cell (20 m) footprint.

## Decision

1. **Building:** `stock.deep-space-dish`, 8 × 8 cells, levels that are station tiers **4, 5 and 6**, costs 0.6, 1.2 and 2.4 M with 40, 60 and 90 build days and 400 kW. The tracking dish stays tiers 1–3.
2. **Station tiers:** `SITE_STATION_RANGES` gains 1e12, 4e12 and 1.5e13 m; `SITE_STATION_APERTURES` becomes **9, 12, 18** m for the tracking dish (what fits its footprint) and **64, 70, ≈99** m for the deep-space dish (the 64 m class, its 70 m upgrade, and the 70 m arrayed with two 34 m antennas). This supersedes the values of ADR 0185 point 3; the rule (aperture by tier) is unchanged.
3. **Model** (`packages/renderer/src/site-dish.ts`): a 64 m Cassegrain antenna after the DSN's 64/70 m class (`docs/research/deep-space-dish.md`): pedestal with stair tower and cable wrap; an alidade of two braced towers on a turntable deck; a paraboloid of panel rings with seams, a back-up truss, an elevation bull gear and a counterweight; a quadripod with a hyperbolic subreflector; a feed cone; red lights. It is three nested groups (base, azimuth, elevation) built from the site's material buckets, so it is lit, shadowed and blinks like the rest of the site. A far model (fewer segments, no seams, truss or stairs) is shown beyond 3 km.
4. **Tracking:** a pure step function with 0.25°/s per axis, the short way round in azimuth, from 6° elevation; below that or with nothing to track the dish stows at the zenith. The target is the flown vessel while it is in the home body's sphere, else the nearest body that orbits the home body (the sky target). The scene works it out from the snapshot; the sim is unchanged.
5. The dish moves only where the site is drawn from the building list (the Space Center); the flight's legacy site layout is unchanged.

## Consequences

- A world's link budgets to tier 1–3 stations are lower than before (9–18 m against 10–70 m): about 0.9 dB at tier 1, more at tiers 2 and 3. The deep-space dish is the way to the outer system.
- The owner judges the realism from the journal's four screenshots (`[manual]`).
