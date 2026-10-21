# 266 — A launch refused with "no free physics frame"

**Plan:** [plans/266-launch-refused-no-free-physics-frame.md](../plans/266-launch-refused-no-free-physics-frame.md) · **Session:** launch-bug session, 2026-10-21 · **ADR:** [0250](../decisions/0250-a-launch-makes-room-in-flight-frames.md)

## Root cause

`load-vessel` (`commands.ts`) took a frame with `acquireFrame` and refused when none was free. Plan 257's `makeRoomAt`, which puts a far frame of landed or orbiting vessels on rails, ran only for a wake and Debug's set location. With the two default frames held far from the pad (for example a vessel woken in orbit after Debug set orbit, plus a stage still falling or a vessel landed elsewhere), every launch was refused. Flight then set `status: 'error'`: "The simulation stopped".

Reproduced in `launch-room.test.ts` with one frame: with `load-vessel`'s `makeRoomAt` call taken out, the vessel-in-orbit and debris-in-the-air launches are refused (`ok: false`); the controlled-vessel-in-the-air case had the old text before `roomBlocker`.

## What was done

| Where | What |
|---|---|
| `packages/sim/src/modes.ts` | `roomRail` (surface, orbit, ballistic for uncontrolled debris in the air, null for a controlled vessel in the air); `makeRoomAt` prefers frames with no debris, then takes one with debris; `roomBlocker` names the controlled vessel in the air and what to do; `wakeBlocker` uses it |
| `packages/sim/src/commands.ts` | `load-vessel` into flight runs `makeRoomAt` first; its refusal is `roomBlocker`'s |
| `packages/sim/src/debug.ts` | set location's refusal is `roomBlocker`'s |
| `apps/web` `flight-loop.ts`, `flight/+page.svelte` | a launch refusal is `status: 'refused'`: "Launch refused" with the reason, Back to the VAB and Mission Center |
| docs | ADR 0250, `simulation.md` (making room), plan 266 |

## Verification

- `launch-room.test.ts`: 3 pass; the first two fail with `load-vessel`'s `makeRoomAt` call taken out.
- `bun run typecheck`: 0 errors. `prettier --check` on the changed files: clean.
- `bun run test`: 2079 pass, 4 fail. All 4 are target tests in `packages/scripting` that expect "Probe" and get "Probe 2": plan 270's distinct vessel names, uncommitted in the same checkout, not this change.
- web vitest `CI=true`: 1341 pass, 2 fail. Both are Worker timeouts in `sim-host-script-worker.test.ts` on a loaded machine.
- `bun run lint`: 3 warnings, all in plan 267 and plan 270 files.
- Not checked in the browser: the sim test reproduces the refusal; the "Launch refused" card is a branch on `hud.status`.

## What surprised me

The existing `sim.test.ts` case "one far away needs a free frame" still passes: the two vessels just loaded on the pad are not `landed` before the first step, so they do not count as railable. That is right for that test (both are in flight on the pad) but means a launch right after another load at a far place is still refused until a step has run.
