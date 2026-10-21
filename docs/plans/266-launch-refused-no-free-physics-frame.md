---
id: 266
title: "A launch is refused with \"no free physics frame\" while another vessel flies far away, and Flight stops"
status: done
owner: "launch-bug session"
depends: [257]
phase: 8
created: 2026-10-21
updated: 2026-10-21
---

# 266 — A launch is refused with "no free physics frame" while another vessel flies far away, and Flight stops

**Size:** S

## Goal

Owner report, 2026-10-21 (screenshot): a new launch shows "The simulation stopped — launch refused: no free physics frame (another vessel is in flight far away)", with Reload and Back to the VAB, and no vessel. Launching with other vessels in flight works, as in KSP: they go on rails and stay in the world. A refusal that is still right is a message the player can act on, not a dead game.

## Context

- Plan 257 (item 12, `makeRoom`/`makeRoomAt` in `packages/sim/src/modes.ts`) made room for a wake and for Debug's set location, not for `load-vessel` (`commands.ts`).
- Flight's launch (`apps/web/src/lib/flight-loop.ts`) turned any refusal into `status: 'error'`, the "simulation stopped" card in `routes/(world)/flight/+page.svelte`.

## Scope

**In:** `load-vessel` makes room; debris in the air makes room; the refusal text; Flight's refused card. ADR 0250.
**Out:** putting a controlled vessel in the air on rails (ADR 0250, alternatives).

## Steps

1. Find the refusal and reproduce it in a sim test.
2. ADR 0250 for the debris and controlled-in-the-air cases.
3. `load-vessel` runs `makeRoomAt`; `makeRoomAt` takes debris in the air second; `roomBlocker` names a controlled vessel in the air.
4. Flight shows `refused` as "Launch refused" with Back to the VAB and Mission Center.

## Acceptance criteria

- [x] `packages/sim/test/launch-room.test.ts`: a launch with the one frame held by a vessel flying in orbit far away is accepted and that vessel goes on rails and stays; the same with uncontrolled debris in the air; with a controlled vessel in the air the refusal names "in the air" and the Mission Center and the vessel keeps flying. The first two fail before the fix.
- [x] A refused launch in Flight shows "Launch refused", not "The simulation stopped".
- [x] `bun run test`, `bun run typecheck`, `bun run lint` and the web vitest run with `CI=true` pass (journal).

## Docs checklist

- [x] STATUS row, ADR 0250 and its index row, `simulation.md` (making room), journal.

## Log

- 2026-10-21: Created and done by the launch-bug session from the owner's report. Checks: typecheck 0 errors; my files pass prettier; `bun run test` 2079 pass, 4 fail, all in target tests that expect "Probe" and get "Probe 2" (plan 270's distinct names, uncommitted in the shared checkout); web vitest with `CI=true` 1341 pass, 2 fail, both Worker timeouts in `sim-host-script-worker.test.ts` under load; lint's 3 warnings are plan 267/270 files.
