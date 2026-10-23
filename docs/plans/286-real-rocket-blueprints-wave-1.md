---
id: 286
title: "Mission blueprints, the remaining flights: Kronos V + Selene to the moon and back, Moonwatch to lunar orbit, Horizon Telescope observing, Aurora running its instruments, crew transfer at Horizon Station"
status: draft
owner: ""
depends: [298, 303, 309, 380]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 286 — Mission blueprints, the remaining flights: Kronos V + Selene to the moon and back, Moonwatch to lunar orbit, Horizon Telescope observing, Aurora running its instruments, crew transfer at Horizon Station

## Goal

Every famous-mission blueprint completes its whole mission headless: Kronos V + Selene lands on the moon and returns in one run, Moonwatch Orbiter reaches lunar orbit, Horizon Telescope opens its door and observes, Aurora Research Satellite deploys and runs its instruments, and a crew transfers at Horizon Station.

## Context

- Already done:
  - The six blueprints exist and are owned by stock: `mods/stock/src/blueprints.generated.ts`, baked from the builders in `apps/web/src/lib/editor/missions.ts` by `apps/web/scripts/bake-stock-blueprints.ts` (ADR 0316). Names are English (ADR 0268): Kronos V + Selene, Wayfarer Shuttle, Horizon Station, Moonwatch Orbiter, Horizon Telescope, Aurora Research Satellite.
  - The Library: plan 285.
  - Flights in `apps/web/src/lib/editor/mission-flights.test.ts` (plans 309, 356, 361): Wayfarer Shuttle lifts off, reaches orbit, opens its bay and releases the module, flies SAS re-entry and rolls out on its gear; the Kronos capsule comes home under chutes from a 2 km/s entry; the Selene lander sets down on the moon; a capsule docks with Horizon Station; the Kronos petals are thrown off.
  - Plan 380 (ADR 0317): every stock blueprint launches to low orbit in stock, Sol rescaled and Sol 1:1 with an expected outcome per system (`apps/web/src/lib/editor/blueprint-systems.test.ts:227`).
- Still open: these flights are pieces; no test flies a whole moon landing and return, Moonwatch to lunar orbit, the telescope's observation, Aurora's instruments, or a crew transfer at the station.
- Plan 298 (draft) adds the pointing condition the telescope's observation needs.
- ADRs: 0263, 0255, 0316, 0317, 0268.

## Scope

**In:** The five remaining headless mission tests, and builder fixes (then a rebake) where a flight shows a design falls short.
**Out:** The Wayfarer Shuttle (done); the rover mission and other real rockets (287).

## Design notes

- Fly in the stock system unless a test says otherwise; record each run's time and Δv left in the journal.
- Long flights may use time warp and the Guidance autopilot as the existing flights do.

## Steps

1. Kronos V + Selene: launch, trans-lunar burn, lunar orbit, landing, ascent, rendezvous, return and splashdown in one run.
2. Moonwatch Orbiter: launch to a closed lunar orbit.
3. Horizon Telescope: orbit, open the door, observe the moon (after plan 298's pointing condition).
4. Aurora Research Satellite: orbit, deploy panels and boom, run its instruments.
5. Horizon Station: dock a crewed capsule and transfer a crew member into the station.

## Acceptance criteria

- [ ] `mission-flights.test.ts` passes with the five new flights (web vitest with `CI=true`).
- [ ] `stock-blueprints.test.ts` (bake equality) and `blueprint-systems.test.ts` pass.
- [ ] `bun run lint`, `bun run typecheck`, `bun run test` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/286-real-rocket-blueprints-wave-1.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of BP-01, BP-15 and the mission targets of §11.

## Log

- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: the blueprints (ADR 0316), the Library (285) and most flights (309, 356, 361, 380) are done; this plan keeps the full moon trip, Moonwatch to lunar orbit, the telescope's observation, Aurora's instruments and the station's crew transfer; "Ulang-Alik" is the Wayfarer Shuttle (ADR 0268).
- 2026-10-21 — Parts delivered in plan 303: six blueprints in apps/web/src/lib/editor/missions.ts that pass the pre-flight checks. Open: the Library (285), headless mission flights.
- 2026-10-21 — Re-scoped to the owner's mission targets: famous missions first, other real rockets later.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
