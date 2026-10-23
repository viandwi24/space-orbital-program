---
id: 281
title: "Payload bays: no decoupling inside a closed bay; a sim test that a closed bay blocks drag and heat"
status: dropped
owner: ""
depends: [302, 303]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 281 — Payload bays: no decoupling inside a closed bay; a sim test that a closed bay blocks drag and heat

## Goal

Decoupling a payload that sits inside a closed bay is refused with a message; with the doors open it separates. A sim test proves that a part inside a closed bay takes no drag or heat, and does once the doors open.

## Context

- Already done by plan 303 (5dc6fbb4): service bays, the cargo bay with doors, payload petals, couplers 2/3/4, truss, hub and lattice interstage (`mods/stock/src/parts/missions.ts`, `packages/renderer/src/parts/generators/bays.ts`).
- Already done by plan 302: `ModuleBay` is a shell while closed and none when open (`mods/stock/test/part-support.test.ts:36`); the sim's `shieldedParts` (`packages/sim/src/debris.ts`, used in `frames.ts`) shields parts inside a shell.
- Payload release is tested in flight: `apps/web/src/lib/editor/mission-flights.test.ts`, the Wayfarer opening its bay and letting the module go (plan 356) and the Kronos petals thrown off (plan 345).
- Not done: nothing refuses a decouple inside a closed bay, and no sim test covers a bay's shielding (only fairings: `packages/sim/test/fairing.test.ts`, `heating.test.ts`).
- ADRs: 0261 (bays), 0317 (structure parts checked against their counterparts), 0268 (English messages).

## Scope

**In:** The decouple refusal and its message; sim tests for the refusal and for the bay's shielding.
**Out:** Inventory containers (284); new structural parts (done in 303).

## Design notes

- A decoupler is "inside" a bay when `shieldedParts` counts it shielded by that bay's shell. The refusal applies to the decoupler's action and to staging; the stage still fires its other parts.
- The message names the bay ("Open the cargo bay first").

## Steps

1. The refusal in the sim's decouple path, with a message event.
2. Sim tests: refusal and release; drag and heat inside a closed and an open bay.

## Acceptance criteria

- [ ] A part inside a closed bay takes no drag or heat; opened, it does (sim test).
- [ ] Decoupling a payload inside a closed bay is refused with a message; open, it separates (sim test).
- [ ] `mission-flights.test.ts` still passes (the Wayfarer and Kronos releases).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/281-payload-bays-couplers-and-structure.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: parts (303), `ModuleBay` shielding (302) and payload release flights (356, 345) are done; this plan keeps the decouple refusal and a sim test of the bay's shielding; depends on 302 and 303.
- 2026-10-21 — Parts delivered in plan 303: service bays, cargo bay, petals, couplers, truss, hub, lattice. Open: the decouple refusal inside a closed bay.
- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
- 2026-10-24 — Folded into plan 390 (graphics and performance v2, ADR 0330). Dropped by the coordinator.
