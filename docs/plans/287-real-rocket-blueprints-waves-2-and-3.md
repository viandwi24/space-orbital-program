---
id: 287
title: "More blueprints: a lunar rover mission, then other famous rockets (Semyorka-S + Union, Kestrel 9 + Wyvern, Hermes-R, Orient-1, Companion-1, Neutron-M + Breeze, Hercules V + Kentauros, Long Road 2F + Divine Vessel, Dioscuri + Giant II, Lumière 5, Kestrel Heavy)"
status: draft
owner: ""
depends: [275, 276, 283, 307]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 287 — More blueprints: a lunar rover mission, then other famous rockets

## Goal

After the rover and engine parts: a lunar rover mission (a rover carried on the lander and driven on the moon) and the other famous rockets of the tracker §9, each a stock blueprint with an English name, flown headless to its goal.

## Context

- Research: `refs/part-visuals-and-blueprints/parts-tracker.md` §9 (BP-02…BP-13, BP-16). Its proposed names are Indonesian; ADR 0268 makes every in-game name English, and `mods/stock/test/english.test.ts` and the blueprint test enforce it.
- Proposed English names (the owner may change them):

  | Tracker | Inspired by | Tracker name | Blueprint name |
  |---|---|---|---|
  | BP-16 | Lunar Roving Vehicle | Penjelajah Selene | Selene Rover |
  | BP-03 | Soyuz | Semyorka-S + Persatuan | Semyorka-S + Union |
  | BP-07 | Falcon 9 + Dragon | Rajawali 9 + Naga | Kestrel 9 + Wyvern |
  | BP-12 | Mercury-Redstone | Hermes-R | Hermes-R |
  | BP-04 | Vostok | Semyorka-V + Timur-1 | Semyorka-V + Orient-1 |
  | BP-05 | Sputnik | Pengiring-1 | Companion-1 |
  | BP-06 | Proton + Briz-M | Neutron-M + Angin | Neutron-M + Breeze |
  | BP-09 | Atlas V + Centaur | Herkules V + Kentauros | Hercules V + Kentauros |
  | BP-10 | Long March 2F + Shenzhou | Jalan Jauh 2F + Perahu Ilahi | Long Road 2F + Divine Vessel |
  | BP-13 | Gemini-Titan II | Dioskuri + Raksasa II | Dioscuri + Giant II |
  | BP-11 | Ariane 5 | Lumière 5 | Lumière 5 |
  | BP-08 | Falcon Heavy | Rajawali Berat | Kestrel Heavy |

- How a stock blueprint is made (ADR 0316): write its builder in `apps/web/src/lib/editor/missions.ts`, list it in `apps/web/src/lib/editor/blueprint-sources.ts`, run `apps/web/scripts/bake-stock-blueprints.ts` to update `mods/stock/src/blueprints.generated.ts`; `stock-blueprints.test.ts` checks the bake.
- Realism (ADR 0317 point 7): each blueprint lists the systems it is for, and `apps/web/src/lib/editor/blueprint-systems.test.ts` gets a row in its `EXPECTED` table per system.
- Parts it needs: tapered booster tank TNK-09 and toroid TNK-07 (275); vernier engine ENG-06 and segmented SRBs (276); rover parts (307, 283).
- ADRs: 0263, 0255, 0268, 0316, 0317.

## Scope

**In:** The designs, their builders and bake, the `EXPECTED` rows and a headless goal flight for each.
**Out:** Blueprints of plan 286.

## Design notes

As plan 286: fly in the stock system in `mission-flights.test.ts`, and record the outcome per system in `blueprint-systems.test.ts`.

## Steps

1. Rover mission: Selene Rover, carried on the Selene lander, landed and driven 100 m.
2. The other rockets, in the order of the table above.

## Acceptance criteria

- [ ] Each blueprint reaches its goal headless in `mission-flights.test.ts` (web vitest with `CI=true`).
- [ ] `stock-blueprints.test.ts`, `blueprint-systems.test.ts` and `mods/stock/test/english.test.ts` pass with the new blueprints.
- [ ] `bun run lint`, `bun run typecheck`, `bun run test` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/287-real-rocket-blueprints-waves-2-and-3.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: English names proposed for every blueprint (ADR 0268), the stock-owned bake process (ADR 0316) and per-system outcomes (ADR 0317) added; depends on 275, 276, 283 and 307.
- 2026-10-21 — Re-scoped to the owner's mission targets: famous missions first, other real rockets later.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
