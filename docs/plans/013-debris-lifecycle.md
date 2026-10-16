---
id: 013
title: Debris lifecycle and time warp
status: done
owner: "debris session (Claude, 2026-10-16)"
depends: [007, 012]
phase: 1
created: 2026-10-16
updated: 2026-10-16
---

# 013 — Debris lifecycle and time warp

## Goal

After staging, the discarded stage ("<name> (debris)") must not block time warp for minutes. Found in plan 009's manual run: the debris of the two-stage ascent keeps `mode: flight` (its periapsis is inside the atmosphere, so it never goes on rails) and stays alive for more than 2.5 simulated minutes after reaching orbit, so `warp` is refused with "time warp needs every vessel on rails; in flight: ...". A player cannot warp after a normal launch.

Reproduced headlessly (2026-10-16, scripted ascent of `twoStage()`): staged at 61 s, orbit reached at 213.6 s (the controlled vessel is on rails at 215.6 s), but the debris (apoapsis above the atmosphere, periapsis far below the surface) stays in flight until it hits the ground at 380.3 s (plan 012 destroys it there), so `warp` is refused from 214 s to 380 s ("in flight: 8 (\"Two-stage (debris)\")"). The draft's "warp 5 at 400 s" check would already pass after plan 012, so the test must ask earlier (see Acceptance criteria).

## Context

- Read: `docs/architecture/simulation.md` (Vessel modes, time warp), `docs/journal/009-web-client-mvp.md`, plan 012 (ground contact and impact damage; debris that falls to the ground), ADR 0017 (flight model), ADR 0019 (ground tile).
- Rule chosen by ADR 0021 (written in this plan): uncontrolled debris on a non-stable path goes on rails and is propagated analytically; it is removed when it descends into the atmosphere (or reaches the surface); uncontrolled debris at rest on the ground is removed after a short rest time. Controlled vessels (any `controlSource` part) are never touched.

## Scope

**In:** the rule in `packages/sim` (`modes.ts`, `sim.ts`, `constants.ts`), tests, `architecture/simulation.md` time-warp rule, ADR 0021, glossary. The HUD-visible reason already exists (the refusal names the vessel), so the web client needs no change.
**Out:** orbital debris management (debris in a stable orbit already goes on rails by plan 007's rule and stays there), collision between vessels, atmospheric drag on rails, warping with a *controlled* vessel standing on the ground (needs surface-fixed rails: draft plan 016).

## Steps

1. Reproduce headlessly (done, see Goal): scripted ascent; after `done` plus 3 s `warp` 5 is refused naming the debris. Keep this as the "before" evidence in the journal.
2. ADR 0021 with the rule. Implement in `packages/sim`: (a) ballistic debris goes on rails (`autoRails`), (b) a rails vessel that is ballistic debris is destroyed on entering the atmosphere / reaching the surface, (c) uncontrolled landed debris at rest is destroyed after the rest time. Constants in `constants.ts`. Deterministic: no clock, no PRNG, decisions from state and `t` only.
3. Tests in `packages/sim/test/debris.test.ts` (fail before, pass after).
4. Docs: `simulation.md`, ADR index, STATUS, journal, draft plan 016 for the out-of-scope landed-vessel warp.

## Acceptance criteria

- [x] `packages/sim/test/debris.test.ts`: scripted two-stage ascent, run to `done` and 3 s more (about 217 s, long before the debris would hit the ground at about 380 s), then `dispatch({ type: 'warp', factor: 5 })` is `ok` and a following `step` of 100 s of host time (warp 5, 500 s sim) leaves exactly one vessel (the orbiter, on rails); a `vessel:destroyed` event with a reason naming re-entry was emitted for the debris. The same test fails on the tree before the change (warp refused).
- [x] Debris born ascending is on rails (`mode: on-rails`, `orbit` present) within 3 s of separation; debris descending below the atmosphere top is removed; debris already below the ground-tile band (400 m) stays in flight, falls and takes impact damage as in plan 012.
- [x] A controlled vessel is never put on rails or removed by this rule: the existing refusal test (`warp.test.ts`, pad vessel in flight) still passes; uncontrolled debris at rest on the ground (a tank loaded on the pad) is destroyed after the rest time with reason naming the surface, and `warp` is then accepted.
- [x] Plan 007 scenario (`scenario-orbit.test.ts`), plan 012 landing test, determinism and all `packages/sim` tests still pass.
- [x] `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check` pass.

## Docs checklist

- [x] `docs/architecture/simulation.md` (time warp rule, vessel modes), ADR 0021 + index, `docs/STATUS.md`, journal 013, glossary, draft plan 016.

## Log

- 2026-10-16 — Created as draft (found by plan 009).
- 2026-10-16 — Refined draft → ready at the human's request (session: debris session). Reproduced; the draft's "warp at 400 s" criterion is stale since plan 012 (debris is destroyed at 380 s), replaced by a warp 3 s after reaching orbit.
- 2026-10-16 — Done. ADR 0021 (ballistic debris on rails, removed at re-entry or at rest); `packages/sim/test/debris.test.ts` (6 tests; 4 fail on the old tree, all pass now). Evidence: `bun test` 317 pass / 0 fail, typecheck, build, docs:check clean. Landed controlled vessels still block warp: draft plan 016. Journal 013.
