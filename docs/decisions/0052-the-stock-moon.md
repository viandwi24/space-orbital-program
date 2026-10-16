# 0052 — The stock moon: data and Δv budget

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/044-moon-and-soi-transitions.md
**Builds on:** ADR 0048 (v1 scope), 0051 (hierarchy). Research: `research/soi-and-moon.md`.

## Context

The moon must be reachable with stock parts (one engine type, Isp 300 s vacuum, tank mass ratio near 18:1), landable, and feel like a small airless world of the same scale as the home planet (radius 600 km, surface 9.81 m/s²), without copying another game's body.

## Decision

`mods/stock` registers `stock.cinder` ("Cinder"): radius 190 km, surface gravity 1.6 m/s² (mu 5.776e10 m³/s², mass mu / G), no atmosphere, rotation period equal to its orbital period (tidally locked), parent `stock.home`, a circular equatorial prograde orbit at 11 800 km, `m0` 1.0 rad at `t = 0`. Laplace SOI about 2 280 km. Equatorial and circular keeps the first trip a plain Hohmann transfer from the equatorial launch site, which is what the scripted mission test flies. Other bodies would use the same data shape. The Δv budget (circular 80 km orbit to landing) is computed from these numbers in journal 044. A mod may add moons by `defineBody` with `parent` and `orbit`; no other sim change needed.

## Consequences

- Save format 2 and transitions are ADR 0051; this ADR only fixes the data.
- Terrain for the moon is the renderer's and sim host's concern (ADR 0053).
