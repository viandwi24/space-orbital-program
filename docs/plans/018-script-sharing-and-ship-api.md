---
id: 018
title: Script sharing container and ship API constants
status: done
owner: "script-api session (Claude, 2026-10-16)"
depends: [017]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 018 — Script sharing container and ship API constants

## Goal

Make scripts safe enough to share and usable without magic numbers: the runner moves into its own Worker that the sim Worker can kill (ADR 0031), and the script `ship` API gains engine and reaction-wheel constants so the sample ascent has none hardcoded. A player-facing script reference exists.

## Context

- Read: ADR 0020, ADR 0022 (amended by 0031), ADR 0031, journals 010, 015, 017, 018, `architecture/scripting.md`, `research/scripting.md`.
- Human, 2026-10-16: "Don't stop until all plans and work are done and ready to market to the public." For scripting: honest security posture, scripts can read what they need, documented for players.

## Scope

**In:**
- ADR 0031: the runner runs in a per-Run script Worker spawned by the sim Worker; one tick in flight; watchdog and boot deadline end it with `Worker.terminate()`; the sim Worker accepts only script-type commands for the script's vessel from it; first-tick budget allowance.
- `ship.engines` (thrust, Isp vacuum and sea level, ignited, throttle, flameout), `ship.wheels` (torque, enabled), `ship.parts[i].mass`, read from part definitions by config shape (no stock ids in `@orbital/scripting`).
- The sample ascent without thrust, Isp or torque literals.
- `docs/guides/scripting.md`: the script API reference for players, with the security posture.

**Out:** share/import UI, syntax highlighting, script panel polish (plan 023), hosting-level CSP and the sandboxed-iframe hardening (draft plan 030), exposing arbitrary module configs.

## Design

See ADR 0031. Files: `apps/web/src/lib/{script-protocol,script-worker-core,script.worker,script-channel}.ts`, `sim-host.ts` (`spawnScriptWorker` replaces `createRunner`), `sim.worker.ts`; `packages/scripting/src/{telemetry,runner,samples/ascent}.ts`.

## Steps

1. Research and ADR 0031 (done: `research/scripting.md`).
2. `ship.engines`/`wheels`/part `mass`; sample without constants; tests.
3. Script Worker, channel, host wiring, real-thread tests; `firstTickBudgetMs`.
4. Manual run in the built-in browser.
5. Guide, architecture doc, journal, STATUS.

## Acceptance criteria

- [x] `ship.engines`, `ship.wheels` and `ship.parts[i].mass` equal the stock part definitions (thrust 215000, Isp 300/280, torque 5000) and change when staging removes parts. `bun test packages/scripting` (`api.test.ts`).
- [x] The sample ascent source contains no thrust, Isp or torque literal and uses `ship.engines`/`ship.wheels`; headless it reaches periapsis > 70 km, e < 0.1 (76.24 km, e 0.026, unchanged), also with every command delayed 3 ticks. `ascent.test.ts`.
- [x] Sandbox tests still pass: no `world`/`fetch`/DOM, escape tricks fail, `ship` surface is exactly the documented one. `sandbox.test.ts`.
- [x] A script that blocks inside a native builtin (a QuickJS `indexOf` that runs seconds) or a wedged script thread cannot delay a sim tick by more than 100 ms (measured worst tick is recorded in the journal; the test bound is 100 ms) and is terminated by the watchdog; the sim keeps ticking after the script Worker is gone, and the thread exits. `bun run --filter @orbital/web test` (`sim-host-script-worker.test.ts`, real `worker_threads`).
- [x] A Worker that never boots is failed after the boot timeout; commands outside the script set or for another vessel from the script Worker are dropped. Same file. Mutation: disabling the watchdog or the command filter fails the tests.
- [x] The budget limit is documented by a test (a native builtin overruns the interrupt budget) and the first-tick allowance only applies to tick 1 (`budget.test.ts`).
- [ ] `[manual]` In the built-in browser the sample ascent from the panel reaches orbit with the script in its own Worker; a script that blocks natively is terminated with the page live. **In part:** the script Worker ran in the real browser (nested Worker, one `.wasm`): liftoff, staging at 70.5 s and the 80 km cut with tick times 0.2 ms last / 4.2 ms worst (journal 018). The run to orbit and the browser runaway were not finished: the shared Browser pane was hidden by the user and the page stops compositing (and Vite reloads on other sessions' edits). Covered headless instead (real-thread tests, ascent with delayed commands); to repeat by hand before release (plan 023).
- [x] `docs/guides/scripting.md` exists and lists every global, `ship` field, command and limit; `architecture/scripting.md` describes the Worker arrangement.
- [x] The scripting and script-host timing tests are robust under load (found during execution, below): 10 sequential and 18 parallel `bun test packages/scripting` runs and 10 + 48 `vitest` runs of the sim-host script files all green; no wall-clock assertion below a hang-detector bound.
- [x] `bun test`, `bun run typecheck`, `bun run build` (one `.wasm`, in the script Worker bundle), `bun run docs:check`, web tests and `prettier --check` pass.

## Docs checklist

- [x] `STATUS.md`, journal 018, `architecture/scripting.md`, ADR 0031 (+ 0022 status), `research/scripting.md`, `guides/scripting.md`, draft plan 030.

## Log

- 2026-10-16 — Created as draft by plan 017 (items split out of draft 017: conditional on scripts becoming shareable).
- 2026-10-16 — Refined draft → ready at the human's request (session: script-api session). Decision: own Worker now, justified by a measured 25 s native-builtin stall (ADR 0031).
- 2026-10-16 — ready → in-progress (script-api session).
- 2026-10-16 — Found during execution (coordinator request): the timing tests were flaky under machine load (a `bun test` failure per run in a different scripting test; `sim-host-script.test.ts` measuring 201 ms against a 50 ms bound). Fixed without weakening what they prove: assertions are now on the mechanism (status, error text naming the budget, ticks after the kill return `elapsedMs === 0`, sim time advances, thread exit), wall-clock bounds are hang detectors (2 s; 25 s for memory exhaustion, which itself takes ~1 s) or calibrated in the same run (host tick bound = max(500 ms, 20 x worst empty tick)); behaviour tests default to a 1 s budget (`helpers.ts`), the sim-host plumbing tests to 5 s; the ascent test no longer asserts a max tick time (`finished` already proves no tick overran). Results in journal 018.
- 2026-10-16 — in-progress → done (in part: the `[manual]` orbit/runaway browser criterion is unticked, see above). Manual browser run partly done (see criterion). Draft plan 030 created for the pushed-out hardening and tooling items.
