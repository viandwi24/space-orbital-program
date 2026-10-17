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

- ADRs: 0107, 0026
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

- [ ] Existing HUD vitest tests (`navball-math`, `sas-model`, `hud-model`, `delta-v`) pass unchanged.
- [ ] `bun run e2e` (Chromium, Firefox, WebKit): flight smoke passes; `e2e/mobile.e2e.ts` passes at 1024x768 and 1180x820 with no overlap between the navball module, staging and the touch throttle.
- [ ] Screenshots at 1920x1080 (pad, orbit, map) in `docs/journal/assets/088-*.png` with the side-by-side self-review against `refs` Main in the journal; HUD frame cost unchanged within 0.2 ms (M5).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/088-ui-stage-2-flight-hud.md` written.
- [ ] `product/visual-direction.md` if the layout differs from the refs.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0107, 0026).
