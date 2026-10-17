---
id: 061
title: "Aurora curtains on the night side at high latitude"
status: draft
owner: ""
depends: [054]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 061 — Aurora curtains

## Goal

A night sky at high latitude shows an aurora: green curtains low in the sky, a red upper fringe, moving slowly; from orbit, a faint ring around the pole on the night side.

## Context

- Pushed out of plan 054 (optional item 3 of its draft): the plan's two required items (ozone sky, light shafts) took the session. Research (`docs/research/three.md`, "Plan 054"): Lawlor and Genetti's emissive volume (energy by height times a 2D flux footprint, ray marched) and 50-step hobby curtains with triangle noise.
- The planet pass has the stars and the night sky in one pass; an emissive term would add after the atmosphere march, gated by latitude and a dark sky (no cost by day or at low latitude, as the shafts' strength gate does).

## Scope

**In (to be ordered at refinement):** a pure model (`aurora-model.ts`: oval latitude, height profile, curtain shape, colours by height, tested); a march of a few steps through the 100 to 250 km shell with an emission term; presets (`low` off); frame budget at the pad at a high latitude site; screenshots.
**Out:** a second launch site (the site is fixed at 0.009 rad latitude, so the pole is only reachable by flying there); sound; moons.

## Acceptance criteria

- [ ] To be made measurable at refinement (tests for the model, `[manual]` screenshots at 70 degrees latitude at night, a frame-time table per preset, no cost elsewhere).

## Docs checklist

- [ ] STATUS, journal, ADR, `docs/research/three.md`.

## Log

- 2026-10-17 — Created as draft by plan 054 (found, not done).
