---
id: 017
title: Script panel follow-ups and landed status in the flight HUD
status: done
owner: ""
depends: [015, 016]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 017 — Script panel follow-ups and landed status in the flight HUD

## Goal

Close the gaps plans 015 and 016 left in the flight view: the script text survives a reload, the HUD stage counter follows what the sim actually fired (including a script's `stage()`), and the HUD shows what a vessel on the ground or in orbit is doing ("landed", "orbit", "suborbital", "flight") with a usable warp control, now that vessels at rest go on surface rails.

## Context

- Read: ADR 0022 (runner in the sim Worker), ADR 0024 (surface rails, `VesselSnapshot.surface`), `docs/architecture/scripting.md` (web section), journals 015 and 016 ("For the web client and the renderer").
- Code: `apps/web/src/lib/{flight-loop,telemetry,storage,sim-host,sim-client,messages,autopilot}.ts`, `apps/web/src/routes/flight/+page.svelte`, `packages/core/src/{protocol,events}.ts`.
- Research: `docs/research/web-client.md` (localStorage, 2026-10-16).

## Scope

**In:**
- Persist the script source per design name in `localStorage` (same hand-off style as `orbital.design`, own key `orbital.script.<design name>`).
- HUD stage counter derived from the sim's `stage:activated` event, forwarded by the Worker host (additive Worker message), not from the page's key presses.
- Landed status (human's request): `computeTelemetry` exposes a `phase` (`landed` for `surface`, `orbit`, `suborbital`, `flight`) and the HUD shows it; HUD warp buttons are enabled when the vessel is on rails (surface rails included). Everything in `apps/web` that read `mode === 'on-rails'` as "in orbit" checks `orbit`/`surface` (telemetry, dev autopilot, map/renderer use). Surface-rails velocity is the root part's ground-fixed velocity, so the HUD "Speed" of a parked vessel is inertial speed of the ground point, as for any vessel (Speed is documented as relative to the body centre).

**Out (pushed to draft 018):** a dedicated script Worker (conditional on scripts becoming shareable; no decision to take now, ADR 0022 stands), engine/wheel constants in the script `ship` API (a `scripting` package change, not panel work). Also out: syntax highlighting, completion, TypeScript scripts, saving several scripts per design.

## Design notes

- No ADR needed: persistence key and a Worker message follow existing patterns (ADR 0022 style); no core change (protocol stays source-compatible; the new message is Worker<->page only).
- Stage counter: the host subscribes to `sim.events` `stage:activated` once the sim exists and posts `{ kind: 'stage', vessel: number, stage: number }`. The page folds events with a pure reducer (`stage-state.ts`: fired count of a vessel = highest `stage + 1`). Local key presses and the autopilot no longer touch `stagesDone`.
- HUD phase (pure, `telemetry.ts`): `surface` -> `landed`; `mode: flight` -> `flight`; `on-rails` with an orbit whose periapsis altitude is above the surface (or an escape orbit) -> `orbit`; `on-rails` otherwise -> `suborbital`. The atmosphere is not used (display label only, no gameplay claim).
- Warp control: two buttons (`-`, `+`) in the HUD calling the same `setWarp` as `,` / `.`; enabled when `telemetry.mode === 'on-rails'` or the warp is above 1 (so it can always be lowered). Keys keep working and still show the sim's refusal.
- The dev autopilot returned early unless `mode === 'flight'`; on the pad the vessel is on surface rails after 2 s, so `P` would do nothing. It now also starts from a `surface` vessel (its first commands wake it).

## Steps

1. Refine (this document; Step 0 of the session).
2. `storage.ts`: `saveScript(name, source)` / `loadScript(name)` (try/catch like `saveDraft`); flight page loads on mount and saves on every edit and on "Load sample".
3. Worker host + messages: forward `stage:activated`; `parseWorkerMessage` case; `sim-client` fan-out (`onStage`); `stage-state.ts` reducer; `flight-loop` derives `stagesDone` from it.
4. `telemetry.ts`: `phase`; HUD row "Mode" shows the phase; `canWarp`; warp buttons in the page via `Flight.setWarp`.
5. Autopilot: allow starting from surface rails.
6. Tests, build, manual check with screenshots, docs, draft 018.

## Acceptance criteria

- [x] `bun run --filter @orbital/web test` passes including: `storage.test.ts` (script round trip per design name, other names isolated, missing key -> `null`, a throwing `localStorage` neither throws on save nor on load); `stage-state.test.ts` (a `stage` event for the tracked vessel sets the count to `stage + 1`, other vessels ignored, order-independent max, reset); `sim-host.test.ts` or `sim-host-script.test.ts` (with the real sim and runner: a script that calls `stage()` makes the host post a `stage` message with `stage: 0`, and no page command is involved); `telemetry.test.ts` (`surface` snapshot -> `phase: 'landed'`, `mode: 'on-rails'`, no apsides; on-rails with periapsis above ground -> `orbit`; on-rails with periapsis below ground -> `suborbital`; flight -> `flight`; `canWarp` true for on-rails, false for flight); `sim-client.test.ts` (a `stage` worker message reaches `onStage`; a malformed one is rejected).
- [x] An autopilot test: `update` on a `surface` snapshot sends `throttle` and `stage` (it did nothing before).
- [x] Mutation check: breaking the host forwarding (not posting `stage`) or the `surface` branch of `phase` makes the corresponding tests fail (restored afterwards).
- [x] `bun run typecheck` (svelte-check 0 errors), `bun run build`, `bun run docs:check`, `bun test`, and `bunx prettier --check .` pass.
- [x] `[manual]` built-in browser, dev server: `/vab` Load two-stage example, Launch; on `/flight` wait on the pad until the HUD Mode reads `landed`; press the warp `+` button and the warp reads above 1x and `T+` advances faster; lower it back. Open Script, Load sample, Run: the Stage row counts `1 / 2 fired` once the script stages (no key pressed). Edit the script text, reload the page: the text is still there. Screenshots `docs/journal/assets/017-*.png`.
- [x] Boundaries: `git diff --stat` touches only `apps/web` and docs (plus any tiny additive change recorded in the Log); `packages/core` untouched.

## Docs checklist

- [x] `STATUS.md` (row 017, row 018 draft, known issues, journal link), journal 017, `architecture/scripting.md` (web section: persistence, stage message), `architecture/simulation.md` unchanged unless a divergence is found, `research/web-client.md` (localStorage).
- [x] Draft plan 018 with a board row.

## Log

- 2026-10-16 — Created as draft by plan 015.
- 2026-10-16 — Scope extended at the human's request: landed status in the flight HUD (surface rails from plan 016).
- 2026-10-16 — Refined draft → ready at the human's request (session: panel session). Decisions: persistence and stage counter in scope (small, same files); the second Worker is conditional ("if scripts become shareable") and the `ship` API constants are a `scripting` package concern, so both go to draft 018.
- 2026-10-16 — Started (in-progress).
- 2026-10-16 — Done. Criteria ran: web tests 10 files / 46 tests (12 new), svelte-check 0 errors, `bun run build` ok, `bun run docs:check` ok (18 plans, 24 ADRs), `bun test` 372 pass 0 fail, `bunx prettier --check .` clean, `git diff --stat -- packages` empty. Mutations (host no longer posts `stage`; `surface` branch of `phase` disabled) each failed their tests and were restored. Manual run in journal 017 (landed, warp 10x and back, script staging 2 / 2, persistence across reload; screenshots `assets/017-*.png`). No tiny change outside `apps/web`. Found, not done: first script tick sits near the 10 ms budget (one run terminated at 12.1 ms with the pane hidden); noted for draft 018. Draft 018 created (second Worker, ship constants).
