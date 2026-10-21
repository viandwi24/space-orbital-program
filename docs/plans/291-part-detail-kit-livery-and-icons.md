---
id: 291
title: "Part detail kit, liveries, bronze material and honest catalogue icons"
status: draft
owner: ""
depends: []
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 291 — Part detail kit, liveries, bronze material and honest catalogue icons

## Goal

Every part generator can draw rims, bands, raised rings, panel insets, bolts, stub pipes, ribbed hollow bells, hazard stripes, hatches, foil panels, lamps, hinges, solar cells and louvres from one shared kit; tanks, boosters, SRBs, fairings and nose cones take a `livery`; the catalogue icon frames only what is visible, from the side, without blue attach faces, and connectors show a bar. Existing parts look the same or better; nothing else changes.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0255, 0257
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** `generators/kit.ts`, `bronze` slot, `visual.params.livery` (additive), icon framing and view in `packages/renderer/src/vab/` (`renderIcon`, `frameIcon`), liveries applied to `tank`, `booster`, `fairing`, `nose-cone`, `decoupler` hazard stripe; OrbitX titles for the parts touched (ADR 0255).
**Out:** New generators per part kind (plans 276–284).

## Design notes

Kit functions take the builder and a placement and add geometry to existing slots; small repeated pieces go through instancing. Icon bounds use `Box3` over visible meshes only (hidden canopy and plume excluded). Frame budget per ADR 0257 point 6.

## Steps

1. Write `kit.ts` with unit tests (each primitive closes, walks bottom to top, stays inside its bounds).
2. Add the `bronze` slot and `livery` param with tests per livery.
3. Fix icon framing and view; render the 76 stock icons to `refs/part-visuals-and-blueprints/img/icons-after/`.
4. Apply liveries to the stock tanks and boosters through palette params; keep default looks unless a livery is set.
5. Measure the pad frame (booster rocket, `high`, M5) before and after.

## Acceptance criteria

- [ ] `bun test packages/renderer` passes, including `test/parts-kit.test.ts` (every kit primitive: closed, seam rule of ADR 0212, winding).
- [ ] The RCS block, parachute and drogue icons fill at least 60 percent of the icon square (test on `frameIcon` with a hidden mesh in the scene).
- [ ] Pad frame of the booster rocket on `high` grows by at most 0.5 ms (journal numbers).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/291-part-detail-kit-livery-and-icons.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
