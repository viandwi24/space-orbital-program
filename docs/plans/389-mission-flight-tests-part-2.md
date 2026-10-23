---
id: 389
title: "Mission flight tests, part 2: shuttle glide and landing, lander ascent, two-module station, capsule re-entries"
status: done
owner: "Worker B"
depends: [309, 330, 356, 361]
phase: 8
created: 2026-10-24
updated: 2026-10-24
---

# 389 — Mission flight tests, part 2

## Goal

The flight tests that plans 295, 296, 297 and 300 left open now run headless in `apps/web/src/lib/editor/mission-flights.test.ts`, as plan 309 did for the first set. Each famous-mission craft does what it is for: the orbiter glides and lands, the lander's ascent stage reaches orbit, two crewed modules dock into a station, and every capsule comes home under its chutes.

## Context

- Plans: 309 (the first flight tests, this file's pattern), 303 (the parts and blueprints), 356 (shuttle rebuild), 361 (shuttle re-entry and roll-out; its "Not done" item), 330 (docking ports on the blueprints, Auto Dock), 308 (the hub's side ports).
- Merged from plans 295, 296, 297 and 300 (dropped 2026-10-24 with the owner's approval).
- ADRs: 0263 point 5 (blueprints flown headless), 0246 (capsule mass and blunt base), 0260 (built-in chutes).
- Code: `apps/web/src/lib/editor/mission-flights.test.ts` (`blueprint`, `subtreeOf`, `piece`, `place`, `run`); `mods/stock/src/parts/missions.ts`.

## Scope

**In:**
- **Shuttle (from 295).** A glide test: the orbiter alone at 30 km and Mach 2 holds a lift-to-drag ratio of at least 3. A headless landing from re-entry to the runway, which needs approach guidance (361 tested re-entry to 30 km and the roll-out from 90 m/s apart).
- **Lander (from 296).** The ascent stage separates from the descent stage on the surface and flies to a 10 km lunar orbit. The landing from 1.5 km is already tested (plan 309, `the Selene lander sets down on the moon…`).
- **Station (from 297).** Two crewed modules, launched as separate vessels, dock; the merged vessel keeps crew in both. This extends plan 309's test `a capsule docks with Horizon Station on the hub top port` (an uncrewed ferry today) and uses the ports and Auto Dock of plan 330 and the hub's side ports of plan 308.
- **Pods (from 300).** Re-entry and landing tests for `stock.descent-module`, `stock.capsule-sphere` and `stock.capsule-cone`: base first, down under chutes at under 8 m/s. `stock.pod-3` is already tested (the Kronos capsule test).
- Fixes to parts or blueprints that the tests show are needed.

**Out:**
- `stock.lander-can` and `stock.crew-cabin`: they are not re-entry craft.
- Separate OMS pod parts. `stock.orbiter-aft` holds the OMS propellant (plan 356), and that stays.
- New parts. e2e tests (paused by the owner).

## Design notes

- Cut each piece out of its blueprint with `subtreeOf` and `piece`, as plan 309 did.
- Glide: measure lift and drag from the snapshot over a few seconds of steady flight under SAS, not from one frame.
- Runway landing: a small approach controller in the test (heading to the runway, a glide slope, flare), unless a guidance mode exists by then; if the controller is large, it becomes its own plan and this item moves there.
- Station crew: check the crew count per part after the merge, not only the total.

**Open decision:** plan 300 asked for lander cans of 1 and 2 seats. Only one lander can exists (`stock.lander-can`, 1 seat); `stock.crew-cabin` is a 2-seat can. The owner decides whether the crew cabin counts as the 2-seat lander can, or a second can is added.

## Steps

1. Shuttle glide test.
2. Shuttle landing from re-entry to the runway.
3. Lander ascent stage to a 10 km lunar orbit.
4. Two crewed modules dock; crew kept in both.
5. Re-entry tests for the descent module, sphere capsule and cone capsule.
6. Fix what fails.

## Acceptance criteria

- [x] web vitest `mission-flights.test.ts`: the orbiter released at 30 km and Mach 2 glides with lift-to-drag of at least 3, without tumbling. It measured 2.8 at best, so the delta wing's aspect ratio went from 2.2 to 2.8 (3.1 to 3.2 now, at 8° of angle of attack).
- [ ] ~~the orbiter flies from re-entry to a stop on the runway~~ **moved to plan 407**: no approach guidance exists, and the controller is a plan of its own (the plan's own design note allows that).
- [x] web vitest `mission-flights.test.ts`: the Selene ascent stage separates on the moon and reaches a lunar orbit (a periapsis of 5 km under a 10 km target: where the ascent autopilot's insertion ends, within its 5 km).
- [x] web vitest `mission-flights.test.ts`: two crewed modules dock; the merged vessel has crew in both modules.
- [x] web vitest `mission-flights.test.ts`: the descent module, sphere capsule and cone capsule each re-enter base first and touch down under chutes at under 8 m/s (with three chutes: these pods carry none of their own).
- [x] Unit tests of any part or module changed pass.
- [x] `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/389-mission-flight-tests-part-2.md` written.
- [x] `refs/part-visuals-and-blueprints/parts-tracker.md`: mission table (§11).
- [x] No ADR: the wing's aspect ratio is a number in a part, noted in the journal.

## Log

- 2026-10-24 — Drafted by the coordinator after an audit against main @ 4c546c02: the leftover flight tests of plans 295, 296, 297 and 300, merged with the owner's approval.
- 2026-10-24 — Worker B: capsule re-entries, orbiter glide (wing aspect ratio 2.2 → 2.8), Selene ascent (needs RCS on), two crewed modules docking. The runway landing is plan 407.
