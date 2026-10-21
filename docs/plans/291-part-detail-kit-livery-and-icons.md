---
id: 291
title: "Part detail kit, liveries, bronze material and honest catalogue icons"
status: done
owner: "part visuals session (Claude)"
depends: []
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 291 — Part detail kit, liveries, bronze material and honest catalogue icons

## Goal

Generators share a detail kit (rims, bands, raised rings, bolt circles, stub pipes, ribbed hollow bells, hazard stripes, inset panels, louvres, solar cells, hinges); tanks and boosters take a `livery`; three material slots (`bronze`, `foam`, `tile`) exist for the parts to come; the catalogue icon frames only what is drawn, from a lower side view in neutral light, and connectors show a bar. The default look of every existing part stays, except the decoupler's hazard band (yellow and black blocks) and the solid motors, which wear `bands` (white with black bands).

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0255, 0257
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** `generators/kit.ts`; slots `bronze`, `foam`, `tile`; `visual.params.livery` (a string, so no schema change) read by `tank` (and `plain`) and `booster`; decoupler hazard band; solid motors in `bands`; icon bounds, view direction and light in `packages/renderer/src/vab/` (`visibleBounds`, `ICON_VIEW_DIR`, `renderIcon`, the vessel thumbnail); a sample bar in connector icons.
**Out:** hatch, foil-panel and lamp primitives (added by the family plans that first need them: 278, 280, 298); liveries on fairings and nose cones (275, 276); OrbitX titles (each family plan renames its parts, ADR 0255); new generators (275–298).

## Design notes

Kit functions take the builder and a placement and add geometry to existing slots; small repeated pieces go through instancing. Icon bounds use `Box3` over visible meshes only (hidden canopy and plume excluded). Frame budget per ADR 0257 point 6.

## Steps

1. Write `kit.ts` with unit tests (bounds, winding of the bell profiles, slots).
2. Add the slots and the `livery` param, with tests per livery.
3. Fix icon framing (visible meshes only), view and light; render the stock icons to `refs/part-visuals-and-blueprints/img/icons-after/`.
4. Solid motors in `bands`; decoupler hazard band from the kit.
5. Triangle cost of the changed parts, before and after (the owner asked to skip long browser runs: no frame measurement).

## Acceptance criteria

- [x] `bun test packages/renderer` passes, including `test/parts-kit.test.ts` (kit bounds, bell winding, hazard slots, every livery inside its barrel, foam and steel tanks, `visibleBounds`, icon fill of the RCS and parachute parts).
- [x] The RCS blocks and the three parachutes frame to their visible parts: hidden plumes and canopies made their old bounds over 1.5 times larger (test), and their icons now fill the square (journal sheet).
- [x] Triangles of the booster rocket's changed parts grow by under 3 percent at `high` (journal numbers); no frame measurement (owner's instruction).
- [x] `bun run lint` (with another session's uncommitted `.claude/launch.json` left out), `bun run typecheck`, `bun run test`, web vitest with `CI=true` and `bun run docs:check` pass.
- [x] Icons of every stock part before and after in `refs/part-visuals-and-blueprints/img/icons/` and `icons-after/`.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/291-part-detail-kit-livery-and-icons.md` written.
- [x] Affected docs updated: `guides/writing-a-mod.md` (livery); no architecture doc names the icon framing.
- [x] New ADRs (none: ADR 0257 covers it) written for any decision made here, linked above.
- [x] `docs/research/stack-versions.md`: nothing looked up.
- [x] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
- 2026-10-21 — Refined and done in one session on the owner's go (rocket parts first). Scope trimmed to what the first families need (see Scope Out); frame measurement replaced by triangle counts at the owner's request to skip long runs. Journal 291.
