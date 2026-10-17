---
id: 088
title: "UI stage 2: the flight HUD in the refs style"
status: in-progress
owner: "Agent 2"
depends: [086, 081]
phase: 5
created: 2026-10-17
updated: 2026-10-17
---

# 088 — UI stage 2: the flight HUD in the refs style

## Goal

The flight and map HUD follow the refs layout: world capsule (home to Space Center, world name, MODE · SYSTEM) and time control (play/pause, 8 warp segments, MET/UT and date) top left; the toolbar `Map · VAB · Camera | Dock · Vessel · Staging · Nav · Crew | Menu` top right; the navball module bottom centre (monochrome navball, vertical-speed arc, heading chip, 7-mode SAS pod, SAS/RCS toggles, VEL/ALT); staging bottom left (queue, current stage Δv and tanks, GO, total Δv); a crew placeholder bottom right.

## Context

- ADRs: 0107, 0026, [0144](../decisions/0144-flight-hud-refs-layout-what-has-no-data-yet.md) (written here)
- Read: ADR 0107, 0026 (what stands), `refs/space-orbital-program-ui/docs/SCREENS.md` (Flight, Map) and `CONCEPT.md` §4, `apps/web/src/lib/hud/*`, `routes/flight`, touch layout ADRs 0063 and 0091.

## Scope

**In:**
- Restyle and re-layout of `AppBar`, `WarpControl`, `Navball`/`navball-draw.ts` (monochrome), `SasButtons` (pod), `StageStack`, `SituationBar`, `StatusCard`, toasts.
- Toolbar group toggles panels with the 4 px dot indicator; panels not yet existing (Dock, Vessel, Crew) show their slots empty or disabled.
- The Map view uses the same HUD; the maneuver editor docks above the navball.
- Tablet layout at 1024x768 and 1180x820 keeps working (touch targets 44 px).

**Out:** the dock and its panels (112), vessel panel (111), crew panel (108).

## Touches

- **Size:** M
- **Edits:** `apps/web/src/lib/hud`, `apps/web/src/routes/flight`, `apps/web/src/lib/touch`, `apps/web/src/lib/ui`
- **Shared contracts:** none (uses the stage 1 tokens)

## Design notes

Keep the 10 Hz `HudModel` and the per-frame canvas and CSS-variable paths of ADR 0026; this plan changes components and layout, not the data flow.

## Steps

1. Navball module and SAS pod.
2. Capsule, time control, toolbar.
3. Staging panel.
4. Map view and maneuver editor position.
5. Tablet layouts and e2e.

## Acceptance criteria

- [x] Existing HUD vitest tests (`navball-math`, `sas-model`, `hud-model`, `delta-v`) pass unchanged.
- [ ] `bun run e2e` (Chromium, Firefox, WebKit): flight smoke passes; `e2e/mobile.e2e.ts` passes at 1024x768 and 1180x820 with no overlap between the navball module, staging and the touch throttle.
- [ ] Screenshots at 1920x1080 (pad, orbit, map) in `docs/journal/assets/088-*.png` with the side-by-side self-review against `refs` Main in the journal; HUD frame cost unchanged within 0.2 ms (M5).
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/088-ui-stage-2-flight-hud.md` written.
- [x] `product/visual-direction.md` if the layout differs from the refs.
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0107, 0026).
- 2026-10-17 — Claimed by Agent 2 (Dev B, M2). ADR 0144; navball module and pod, capsules, toolbar, staging, crew placeholder, page layout, monochrome navball, Manrope numbers, journal with the refs review and screenshots. Verification on the M2, rebased on `origin/main` after the 106 merge:
  - `bunx vitest run` (apps/web) — `navball-math`, `sas-model`, `hud-model`, `delta-v*` pass unchanged; 913 passed, 2 failed in `sim-host-script-worker.test.ts` (as on `origin/main` on this M2). `target-navball.test.ts` follows the new theme fields; `layout-model.test.ts` follows `EDGE` 24 and the 12 px gap.
  - `E2E_PORT=5210 bunx playwright test e2e/smoke.e2e.ts e2e/mobile.e2e.ts e2e/touch.e2e.ts e2e/ui-scale.e2e.ts e2e/worlds.e2e.ts --project=chromium` — 23 passed (11.0 m), including mobile at 1024x768 and 1180x820 with no overlap between the module, staging, the script panel and the touch throttle.
  - `--project=webkit` smoke and ui-scale — 8 passed (the sandbox-isolation smoke failed once on the cold first run, "checked at the first Run", and passed on the rerun; not HUD code).
  - Screenshots at 1920x1080 (pad, orbit, map) and 1024x768 in `docs/journal/assets/088-*.png` (`scripts/capture-hud.ts`), reviewed side by side against refs `Main` in the journal; the ball centre measures at x 960 on 1920.
  - `bun test ./packages`, `./mods`, `./examples` — 1369, 93, 7 pass; `bun run typecheck` — 0 errors, 0 warnings; build ok; `bun run docs:check` — OK.
  - Open for others: Firefox e2e (Agent 3 / phase gate) and the HUD frame cost within 0.2 ms on the M5 (Agent 1, criterion 3).
