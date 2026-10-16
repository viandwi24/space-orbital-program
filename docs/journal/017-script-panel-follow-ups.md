# 017 — Script panel follow-ups and landed status in the flight HUD

**Plan:** plans/017-script-panel-follow-ups.md · **Session:** panel session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

The draft was refined to `ready` at the human's request, the scope extended with the landed status (surface rails from plan 016), then implemented. No scaffolding, no new dependencies, no change outside `apps/web` and docs; protocol and `packages/core` untouched (the new `stage` message is Worker <-> page only). No ADR: the decisions follow ADR 0022 and existing patterns.

Scope decisions: persistence and the stage counter are small and live in the same files, so they are in. The second Worker is conditional ("if scripts become shareable") and ADR 0022 already records the trade-offs; the `ship` API constants are a `scripting` package change. Both went to draft plan 018.

| Area | Files |
|---|---|
| persistence | `lib/storage.ts` (`saveScript`, `loadScript`, key `orbital.script.<design name>`), `routes/flight/+page.svelte` (load on mount, save on every edit and on Load sample) |
| stage counter | `lib/messages.ts` (`stage` message), `lib/sim-host.ts` (forwards `stage:activated`), `lib/sim-client.ts` (`onStage`), `lib/stage-state.ts`, `lib/flight-loop.ts` (derives `stagesDone`; key presses and the autopilot no longer count) |
| landed HUD | `lib/telemetry.ts` (`phase`, `canWarp`), page: Status row, warp `-`/`+` buttons, `Flight.stepWarp` |
| autopilot | `lib/autopilot.ts` starts from a vessel on surface rails (it returned early unless `mode === 'flight'`, so `P` on the pad did nothing since plan 016) |
| tests | `storage.test.ts`, `stage-state.test.ts`, `autopilot.test.ts`, additions to `telemetry`, `sim-client`, `sim-host-script` tests |

## Manual run (`[manual]` criterion)

Built-in browser, dev server `web-dev`. Through the UI: `/vab` Load two-stage example, Launch.

- The HUD reads Status `landed`, Mode `on-rails` at T+00:04 on the pad, Speed 174.5 m/s (the ground's inertial speed at the equator), no apsides. Warp `+` x3: 2x, 5x, 10x accepted; T+00:20 to T+00:39 in about 2.6 s of wall time; `-` x3 back to 1x.
- Script panel, Load sample, Run from the pad: the vessel woke, the Stage row went 0 to `1 / 2 fired` with no key pressed, and `2 / 2 fired` at about T+1:08 of the script (log "staged at 67.5 s", "cut: apoapsis 80006 m"). Before this plan the row stayed `0 / 2`.
- Reload: the script text returned (first the sample, then a hand-edited one-liner, verified in `localStorage` under `orbital.script.Two-stage`).
- Screenshots (canvas plus the HUD text through the dev `__orbital.screenshot` hook): `assets/017-landed.png`, `assets/017-landed-warp.png`, `assets/017-script-persisted.png`, `assets/017-script-staged.png`.

## Surprises

- The first script run was terminated ("time budget exceeded", last tick 12.1 ms) while the pane was hidden and my polling script ran in the page. The second run had its worst tick at exactly 10.0 ms (the first tick, QuickJS cold) and survived, the rest 0.1 to 0.5 ms. The first tick of a script sits close to the 10 ms budget in the dev server on this machine; a flake risk for first-tick-heavy scripts, not caused by this plan. Worth a look in plan 018 (warm-up tick or a larger first-tick allowance).
- A pad vessel's speed is 174.5 m/s: the HUD "Speed" is inertial (relative to the body centre), so a parked vessel does not read 0. Left as is (documented in the plan); a ground-relative speed row would be a separate HUD item.
- The renderer needed no change: it already draws the orbit line only when `v.orbit` exists, and places a surface vessel from `position`/`orientation`.
- The autopilot test first failed on a fixture at the pole (`east` normalizes a zero vector); the pad is on +X.

## Open questions / follow-ups

- Draft plan 018: dedicated script Worker when scripts become shareable; engine/wheel constants in `ship`; possibly the first-tick budget.
- Time warp with a running script is still unexercised.

## Verification output

See the plan Log; commands: `bun run --filter @orbital/web test` (10 files, 46 tests), `bun run typecheck`, `bun run build`, `bun run docs:check`, `bun test`, `bunx prettier --check .`.
