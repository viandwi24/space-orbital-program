# 032 — Script API additions and the sandbox in other browsers

**Plan:** plans/032-script-api-additions-and-browser-matrix.md · **Session:** browser-matrix session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0039](../decisions/0039-time-warp-while-a-script-runs.md), [0040](../decisions/0040-browser-support-policy-and-e2e-matrix.md)

## What was done

The draft was refined to `ready` at the human's request (research in `research/browser-support.md`, two ADRs, measurable criteria, two draft plans for what was pushed out), then implemented. Scaffolding: `bunx sv add playwright="demo:no" --no-git-check --no-install` (sv 1.1.1) plus `bun install` and `bunx playwright install chromium firefox webkit` (Playwright 1.64.1). The add-on rewired `test` to run e2e, forced `playwright install` into `test:e2e` and left a demo test despite `demo:no`; all three were undone (ADR 0040). `zod` is now a declared dependency of `apps/web` (`bun add zod@catalog:`).

| Area | What |
|---|---|
| warp (ADR 0039) | `sim-host.ts`: warp hold and pending warp (zero attitude, hold the script's attitude, retry until on rails, 8 s wall limit), script `warp(f)`, throttle tracking; `telemetry.ts` `canWarp(.., scriptRunning)` and the flight route; `sim-host-warp.test.ts` (9 tests) |
| API | `packages/scripting`: `bodies`, `Date` over sim time, command feedback (`seqs` out, `verdicts` in, promises of `stage()/action()/warp()`, `ship.refusals`), `fuelPolls`, `warp` command (1 to 100 000); `script-protocol/-channel/-worker-core` carry `seqs`, `verdicts`, `fuelPolls`; `test/api-additions.test.ts` (6 tests) |
| sandbox probe | sentinel-based `isolated` state (WebKit), page plants a cookie and a Cache entry (`script-sandbox-web.ts`), `script-sandbox-jitless.ts` (Firefox) |
| support policy | `browser-support.ts`, `ui/BrowserNotice.svelte`, layout gate; `docs/product/browser-support.md` |
| e2e | `apps/web/playwright.config.ts`, `e2e/{support,smoke,orbit}.e2e.ts`, `bun run e2e` |

## Results per engine (production build, Playwright 1.64.1, macOS, software-rendered WebGL)

| Engine | Smoke suite (4 tests) | Real-time orbit (`@orbit`) |
|---|---|---|
| Chromium 156.0.8078.4 | pass | pass, 3.9 min; separate watch run: periapsis 76.6 km, finished at 218 s |
| Firefox 157.0 | 3 of 4 in the last full run, the warp test then 8 of 8 on repeat; one launch in about 12 ends in "Vessel lost" on the pad (below) | first attempt failed (Run never enabled, the same symptom), rerun pass 3.6 min; separate watch run: periapsis 76.2 km, 225 s |
| WebKit 27.2 (Safari-equivalent build) | pass (run six times) | pass, 3.7 min |

The suite has `retries: 1`, so a flake shows as "flaky" in the report, not as a pass.

Answers to the sandbox questions are in `research/scripting.md` ("The sandbox in Chromium, Firefox and WebKit"): blob Worker CSP inheritance, `'wasm-unsafe-eval'`, `srcdoc` sandbox starting a blob Worker and a `src` sandbox iframe all work in the three engines.

## What the matrix found

1. **WebKit does not throw in an opaque origin.** `document.cookie` returns `""` and the blob Worker's `caches` is an empty store; the ADR 0038 probe counted any working API as "reachable" and the panel said "Isolation is weaker than designed (frame.cookie, worker.caches)". An experiment with a planted game cookie and cache showed WebKit sees neither, so it is isolated. The probe now plants sentinels and reports `isolated` for "answers but sees nothing of the game's".
2. **Firefox logs zod's `new Function('')` probe as a CSP error** in the Worker (caught, harmless, but an error in the console). zod is told `jitless` before @orbital/core builds its schemas; this had to be the first import (setting it in the Worker's main body was too late, found by running again).
3. **Firefox failed to compile the planet shader** (`patch` is a reserved word in GLSL ES 3.00; Chromium accepted it). It was another session's uncommitted plan 031 change and was fixed upstream before I reported it; the planet was not drawn at all in that build.
4. **Intermittent "Vessel lost" on the pad in Firefox** (about 1 launch in 12; seen twice before the page text was captured, once with it). Not reproduced headlessly; the working tree held other sessions' uncommitted sim changes. Draft plan 047.
5. **`Date` made deterministic broke a test** (`budget.test.ts` spun on `Date.now()` inside the guest, which now never advances). It counts loop iterations now.
6. **Stale preview servers**: `vite preview` kept serving after another session rebuilt `apps/web/build`, so chunks 404ed and the first orbit run failed for all three engines (the Run button never existed). The final runs served a copy of the build from a small static server on port 5192. Not a game bug; a note for CI (build, then serve that output).
7. `zod` and the playwright add-on changed `package.json`/`bun.lock` of `apps/web`; `vite build` also fails whenever another session has a broken `.svelte` file in the tree (it happened once, during plan 026/029 work).

## Warp: the cause and the rule

The sample's attitude loop writes a fresh, non-zero demand every tick; a non-zero wheel torque marks the vessel active, so `idle` never reaches 2 s and `warp` is refused ("needs every vessel on rails"); the HUD also disabled the buttons. The fix is in the host (ADR 0039), not the sim. Mutation check: with the hold bypassed (`requestWarp` always dispatching directly) 7 of the 9 warp tests fail; restored, all pass. The sample itself does not use `warp()`: its coast is about 20 s of simulated time, there is nothing to skip.

## Decisions made

ADR 0039 (warp hold), ADR 0040 (support policy, capability gate, e2e). Pushed out with reasons: draft 035 (target and maneuver data; the sim had no such concept, plans 044/045 add it), draft 036 (editor niceties, needs players and a human accessibility check), draft 047 (the Firefox pad loss). Phones and tablets: not supported, stated.

## Open questions / follow-ups

- Plan 023: run the suite against the real host and its headers (hosting list in `architecture/scripting.md`); decide on phones.
- Draft 047 (intermittent vessel loss, Firefox).
- Minimum versions in the matrix are the platform floor from the feature tables, not tested versions.
- Disk: the Playwright cache grew to 2.8 GB (older builds from other projects were already there; this plan's three engines are about 1.2 GB). Free space stayed at 19 to 20 GB, so nothing was removed.

## Verification output

```
bun test packages mods                          731 pass, 0 fail
bun test packages/scripting                     40 pass (was 34)
apps/web vitest                                 359 pass (35+ files); bun test on the new web tests also passes
apps/web svelte-check                           0 errors (1360 files)
bun run build                                   ok
bun run docs:check                              OK
e2e (bunx playwright test, 3 projects)          smoke: chromium 4/4, webkit 4/4, firefox 3/4 then flake; orbit: 3/3 (firefox on rerun)
```

The root `bun run typecheck` failed at the time of the last run in `packages/core/src/save.ts` and `packages/sim/src/sim.ts` (another session's uncommitted save/load work); `packages/scripting` and `apps/web` have no errors of their own.
