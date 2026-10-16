---
id: 032
title: Script API additions and the sandbox in other browsers
status: done
owner: "browser-matrix session (Claude, 2026-10-17)"
depends: [030]
phase: 2
created: 2026-10-17
updated: 2026-10-17
---

# 032 — Script API additions and the sandbox in other browsers

## Goal

What plan 030 pushed out, narrowed to what a public release needs: time warp that works while a script runs, the script API additions that need no new sim feature, and proof, by an automated suite, that the game and its script sandbox work in Chromium, Firefox and WebKit, with a written support policy and a friendly message where the browser cannot run the game.

## Context

- Read: ADR 0038, 0031, 0022, 0020, 0024; `research/scripting.md` ("Hardened container"), `research/browser-support.md`; `architecture/scripting.md`, `guides/scripting.md`; journals 018 and 030 (warp did nothing while the sample coasted).
- New ADRs: 0039 (warp while a script runs: the host holds the script's controls), 0040 (browser support policy and the e2e suite).

## Scope

**In:**

1. **Warp while a script runs** (ADR 0039): host-side hold and pending warp, script `warp(factor)`, HUD enabled while a script runs.
2. **Script API additions:** `bodies` (data of every body in the registry; `ship.body` names the current one); `Date` made deterministic (sim time); command feedback (`stage()`, `action()`, `warp()` return a promise of `{ ok, reason? }`; `ship.refusals` lists last tick's refused commands incl. throttle and attitude); a deterministic fuel count (interrupt-handler polls) next to the wall budget.
3. **Browser matrix:** Playwright (official `sv add playwright`) with chromium, firefox, webkit projects; smoke suite plus the `@orbit` test; sandbox questions of the plan 030 draft answered per engine (blob Worker CSP, `'wasm-unsafe-eval'`, `srcdoc` + `sandbox`, `src` iframe outside the Claude app).
4. **Support policy and gate:** `product/browser-support.md`, a capability check with a friendly notice (WebGL2, Worker, WebAssembly).

**Out (pushed to drafts, with reason):**

- Target and maneuver information in scripts: the sim has no target or maneuver-node concept; it needs sim and UI features first (draft 035).
- Editor niceties (Tab indentation, auto-indent, bracket matching, API popover): the draft said "only if players ask, and only after a keyboard-accessibility check"; nothing has asked yet and the check needs a human with assistive technology (draft 036).
- Phones and tablets: not supported, stated in the policy; a device run needs hardware (plan 023 decides).
- Moving scripting to a server (as before).

## Steps

1. Refine: research (`research/browser-support.md`), ADRs 0039 and 0040, this plan; `ready` then `in-progress`.
2. Scaffold Playwright with `sv add playwright` (keep `test` unit-only); verify the three engines launch.
3. `packages/scripting`: `bodies`, `Date`, command feedback (sequence numbers out, verdicts in), fuel count, `warp` command in the runner; tests.
4. `apps/web`: protocol (`seqs`, `verdicts`), host warp hold and pending warp, HUD enablement; tests in `sim-host-script.test.ts`; sample uses `warp` in the coast.
5. Capability gate (`browser-support.ts`, layout notice) with unit tests.
6. E2E suite (`apps/web/e2e/`), run in the three engines against the production build; record versions and results.
7. Docs: `product/browser-support.md`, architecture and guide, journal, STATUS, AGENTS.md command, drafts 035 and 036.

## Acceptance criteria

- [x] **Warp rule (unit)**: `bun run --filter @orbital/web test` has tests showing (a) a script writing a new non-zero attitude every tick keeps a coasting vessel in flight, with no hold the sim refuses warp (control); (b) with the host hold, a warp request is accepted once the vessel is on rails, `sim.t` advances at the factor and the script keeps running; (c) attitude commands during warp are not dispatched and the script is told why; (d) a burning script (throttle > 0) gets an immediate refusal; (e) `warp 1` restores the held attitude; (f) a request the sim keeps refusing is answered after 8 s of wall time with the sim's reason; (g) a script `warp(f)` resolves its promise.
- [x] **API (unit)**: `bun test packages/scripting` has tests for `bodies` (frozen, other bodies present), `Date` (`Date.now()` equals sim time in ms, `new Date()` the same, with arguments unchanged), command feedback (`stage()` resolves `{ ok: true }`, a refused command resolves `{ ok: false, reason }` the next tick, `ship.refusals`), the fuel count (a `while (true) {}` ends with the same poll count on repeated runs, independent of the wall clock), and `warp(f)` validation (1 to 100 000).
- [x] **Capability gate (unit)**: tests for the pure check (missing WebGL2, Worker or WebAssembly give a message naming the missing feature; all present gives none), and the notice component renders in vitest.
- [x] **E2E smoke in chromium, firefox and webkit**: `bun run e2e` (all three projects, production build) passes: `/` and `/vab` load, the two-stage design is built or loaded, launch works, the sample script runs ("liftoff" printed, altitude above 1 km within 60 s), the panel reports "Runs isolated" with all ten probes blocked, warp works while a script holds an attitude, and no console error or page error is logged.
- [x] **E2E orbit**: `E2E_ORBIT=1 bun run e2e -- --grep @orbit` in each engine: the sample ascent reaches a periapsis above 70 km (status `finished`). If an engine cannot, it is recorded with the exact failure and the support policy says so.
- [x] **Support matrix**: `product/browser-support.md` lists desktop Chrome, Edge, Firefox and Safari floors, the tested engines with their version strings, the phone and tablet position, and the in-app notice; ADR 0040 accepted; `product/spec.md` links it.
- [x] **Research and answers**: `research/browser-support.md` has URLs and date; `research/scripting.md` has the measured answers per engine to the questions of the 030 draft (blob Worker CSP, wasm, srcdoc sandbox, `src` iframe).
- [x] `bun test`, `bun run typecheck`, `bun run build`, `bun run docs:check`, web vitest, prettier on touched files all pass.
- [x] **Pushed out with a reason**: drafts 035 and 036 exist with board rows.

## Docs checklist

- [x] `STATUS.md`, journal 032, `architecture/scripting.md`, `guides/scripting.md`, `research/scripting.md`, `product/browser-support.md`, AGENTS.md (e2e command), ADRs 0039/0040 in the index.

## Log

- 2026-10-17 — Created as draft by plan 030.
- 2026-10-17 — Refined draft -> ready at the human's request (session: browser-matrix session). Kept: warp-with-script, `bodies`, `Date`, command feedback, fuel count, browser matrix. Pushed to drafts with reasons: target/maneuver data (no sim concept), editor niceties (conditional on players and a human a11y check). Added: capability gate and support policy (needed for the matrix to mean anything).
- 2026-10-17 — Status ready -> in-progress, owner set.
- 2026-10-17 — Done. Criteria evidence: warp rule 9 tests in `sim-host-warp.test.ts` (mutation check: 7 fail with the hold bypassed); API 6 tests in `packages/scripting/test/api-additions.test.ts` (scripting suite 40 pass); capability gate 5 tests in `browser-support.test.ts` (the notice renders under vitest; skipped under bare `bun test`); e2e smoke passes in chromium, firefox and webkit with one retry allowed (Firefox flake, draft 047); orbit passes in all three (Firefox on the second attempt, periapsis above 70 km asserted; watch runs 76.6 km Chromium, 76.2 km Firefox); matrix in `product/browser-support.md`; research files updated. Deviations: the e2e suite serves a build copy in my runs (stale `vite preview`), `retries: 1` is set; root `bun run typecheck` failed on another session's uncommitted core/sim save work, packages/scripting and apps/web are clean. Journal: `journal/032-script-api-additions-and-browser-matrix.md`.
