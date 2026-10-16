# 013 — Debris lifecycle and time warp

**Plan:** plans/013-debris-lifecycle.md · **Session(s):** debris session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

The draft was refined to `ready` at the human's request, then implemented. No scaffolding, no new dependencies, no change to `createSim`'s API, the protocol or `@orbital/core`.

| Area | Change |
|---|---|
| sim `modes.ts` | `ballisticEligible` (uncontrolled, idle 2 s, not landed, > 400 m up, not in a stable orbit, climbing or above the atmosphere top -> on rails, reason `ballistic debris`); `reapDebris` (on-rails non-stable uncontrolled vessel destroyed when descending below the atmosphere top or at the surface; uncontrolled vessel at rest on its ground tile for 10 s destroyed); `autoRails` calls the first |
| sim `sim.ts` | `reapDebris` after `rebaseAll` in both `flightStep` and `railsStep` |
| sim `constants.ts` | `DEBRIS_REST_TIME` 10 s, `DEBRIS_REST_SPEED` 0.1 m/s |
| tests | `test/debris.test.ts` (6 tests) |
| docs | ADR 0021, `simulation.md` (Debris bullet, time-warp line), glossary, draft plan 016 (landed controlled vessels on rails) |

## Reproduction (before the change)

Scripted `twoStage()` ascent (`helpers/ascent.ts`): staged 61 s, `done` 213.6 s, orbiter on rails at 215.6 s. The debris (apoapsis above the atmosphere, periapsis about -350 km) stayed in flight; `warp` 5 answered `time warp needs every vessel on rails; in flight: 8 ("Two-stage (debris)")` at 214, 274 and 334 s, and succeeded only at 394 s because plan 012 destroys the debris on the ground at 380.3 s. So the draft's "warp 5 at 400 s expecting success" would have passed already; the test asks 3 s after `done` instead (about 217 s). Before the change 4 of the 6 new tests fail (stash of `packages/sim/src`); after, all pass.

## Surprises

- The debris is reaped long before the test asks: it is born climbing at 61 s, goes on rails 2 s later, and is removed when it falls back through 70 km, well before the orbit is reached (the orbiter is alone by the time warp is requested). The first draft of the test expected to see the debris still around; the assertion now is that a `re-entered` event happened and nothing else disappeared.
- `VesselSnapshot` has no `name`; tests identify debris by id.
- Another session owned plan 015 (scripting web integration) and ADR 0020; the new numbers are ADR 0021 and plan 016.

## Decisions

ADR 0021. Rails have no drag, so the cut is at the atmosphere top rather than ground impact. Controlled vessels are excluded everywhere; a landed controlled vessel still blocks warp (plan 016).

## Verification

`bun test` 317 pass / 0 fail (43 files); `bun run typecheck` and `bun run build` clean; `prettier --check packages/sim` clean.

## For later plans

- Plan 016: surface-fixed rails so the pad vessel and a lander can warp.
- Plan 014 (heating) may replace "vanishes at 70 km" with burning up; one function (`reapDebris`).
- Web client: no change needed; the refusal reason already names the vessel. A HUD hint that debris was removed could listen for `vessel:destroyed` reasons.
