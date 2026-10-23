---
id: 296
title: "Lunar lander parts: descent stage, ascent cabin, single landing legs, lander engines, lander RCS quads"
status: dropped
owner: ""
depends: [291, 277, 278, 300]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 296 — Lunar lander parts: descent stage, ascent cabin, single landing legs, lander engines, lander RCS quads

## Goal

Everything the Apollo 11 lander ("Selene" lander) needs: an octagonal descent stage wrapped in gold foil with a recessed throttleable descent engine and four single landing legs with footpads, an angular two-crew ascent cabin with triangular windows, a docking port on top, a small dish, four RCS quads and an ascent engine; the stages separate on the surface and the ascent stage launches from the descent stage.

## Context

- Research: `refs/part-visuals-and-blueprints/parts-tracker.md` (§11, missions and the parts they need).
- ADRs: 0257, 0260
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** Generators: descent stage (octagon, foil panels, engine recess), ascent cabin (faceted extrude), single landing leg (strut, shock, footpad; radial; deploy animation), lander engines; parts; OrbitX titles.
**Out:** Rover stowage on the descent stage (rover plan 283).

## Design notes

The single leg uses the existing `ModuleLandingLeg` colliders per leg (radial), not a ring; the descent stage carries a radial-decoupler-like stack decoupler to the cabin.

## Steps

1. Descent stage and engine.
2. Ascent cabin, engine, RCS quads (plan 277 variants).
3. Single legs.
4. Headless test: land the lander from a 15 km lunar orbit, then launch the ascent stage back to orbit.

## Acceptance criteria

- [ ] Lands on the moon at under 3 m/s on its four legs and stands (sim test).
- [ ] The ascent stage separates and reaches a 10 km lunar orbit (sim test).
- [ ] `bun run lint`, `bun run typecheck`, `bun run test` and the web vitest suite with `CI=true` pass; `bun run docs:check` passes.
- [ ] Catalogue icons and a Hangar screenshot of every new part in the journal.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/296-lunar-lander-parts.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers, and the mission table (§11).

## Log

- 2026-10-24 — Parts delivered by plan 303 (and 356/361/309/330); remaining flight tests moved to plan 388. Dropped with the owner's approval.
- 2026-10-21 — Parts delivered in plan 303: descent and ascent stages, single leg. Open: the landing and ascent tests.
- 2026-10-21 — Drafted from the owner's mission targets of 2026-10-21 (Apollo 11, Space Shuttle, station, rover, orbiter, space telescope, research satellite): rocket parts first, rover after, robotics last.
