---
id: 021
title: "UI: design system and flight HUD"
status: done
owner: "hud session (Claude, 2026-10-16)"
depends: [017]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 021 — UI: design system and flight HUD

## Goal

`apps/web` gets a coherent design system (tokens, typography, panels, buttons, icons, toasts) and the flight HUD is rebuilt to genre standard: navball, altitude/speed/vertical-speed gauges with surface/orbit speed, throttle gauge, time and warp control, stage stack with per-stage Δv and fuel, resources panel, vessel/situation bar, event toasts, pause menu, and map-view overlays — so a player who knows KSP/KSP2 recognises and trusts it.

## Context

- Read: `docs/product/visual-direction.md`, `apps/web/src/**`, `docs/research/web-client.md`, ADRs 0006, 0022, 0024, journals 009, 015, 017.
- Known problems from the human's screenshot (2026-10-16): text-table HUD, inertial speed 174.5 m/s shown on the pad, "Untitled vessel", "Stage 0 / 0 fired".

## Scope

**In:** design tokens and base components (Svelte 5), self-hosted fonts (verify licences, e.g. via `@fontsource`), SVG icon set (own), navball (pitch/heading/roll from the snapshot, prograde/retrograde/radial/normal markers, target later), gauges, surface vs orbital speed, stage stack (Δv per stage from part data and remaining resources — pure function, tested), resources panel, time/warp control, toasts from sim events, pause menu (Esc), map-view overlay (Ap/Pe markers, time to Ap/Pe), script panel restyled, keyboard help overlay, empty/error states, responsive down to 1280×720.
**Out:** VAB (022), main menu/settings (023), 3D environment (019) and part looks (020).

## Design notes

Decisions are in [ADR 0026](../decisions/0026-design-system-and-hud-architecture.md): CSS tokens + Svelte 5 components, per-frame widgets drawn outside Svelte, vector Canvas2D navball, speed modes, event-replay stage Δv shared with plan 022 (`apps/web/src/lib/delta-v.ts`), sim events forwarded for toasts, pause message, map markers by mirroring the renderer's map rig. Fonts: Barlow Semi Condensed + IBM Plex Mono (SIL OFL 1.1, `@fontsource`). Layout: top-left app bar, top-centre vessel/situation + toasts, top-right resources, right stage stack, bottom-centre instrument deck (throttle, speed, navball, altitude) with the warp control above it, bottom-left orbit strip. Own identity: cyan/mint/amber/red semantic colours, condensed labels, no KSP art, fonts or layout copy.

## Steps

1. Refine (done, see Log): research in `docs/research/web-client.md`, ADR 0026.
2. Pure maths with vitest first: `format.ts` (units), `speed.ts` (surface/orbit/auto), `navball-math.ts` (attitude, markers, projection), `delta-v.ts`, `orbit-info.ts` (Ap/Pe/time to), `toasts.ts`, vessel naming.
3. Design system: `ui/tokens.css`, `ui/*` components, icons, fonts.
4. Worker/host additions: `pause`, `sim-event` messages (`messages.ts`, `sim-host.ts`, `sim-client.ts`, tests).
5. HUD controller and widgets; rebuild `routes/flight/+page.svelte` (Esc pause menu, help overlay, script panel restyled, map overlay, empty/error states, 1280x720); restyle `/` and `/vab` with the tokens only (no behaviour change; the 3D VAB is plan 022).
6. Manual run with screenshots; self-review; journal; docs.

## Acceptance criteria

- [x] `bun run --filter @orbital/web test` passes with new vitest files covering: (a) per-stage Δv of the stock two-stage vessel equals Tsiolkovsky computed by hand from the part data (vacuum and sea level, relative error < 1e-9) and the sum of stages equals the two-engine hand calculation; live Δv from a sim snapshot after staging drops the spent stage; (b) surface speed < 0.01 m/s for a surface-rails snapshot taken from a real `createSim` run, and equals the inertial speed minus rotation in orbit within 1e-9; (c) auto speed mode switches at the atmosphere top with hysteresis and `V` cycling order; (d) navball pitch/heading/roll for six known orientations in the +Y-north frame, prograde marker direction for known velocities, and projection of the ball geometry; (e) `formatDistance/Speed/Duration/Mass/Angle/Percent` incl. edge values (0, negative, 1e9, NaN); (f) toast mapping for stage, flameout, part damaged (impact/overheat), mode changes and refusals; (g) orbit-info times to Ap/Pe against `@orbital/kepler` propagation; (h) vessel display name for blank/default names; (i) `sim-host` pause (no step, no script tick, no burst on resume) and `sim-event` forwarding; (j) stage-stack row model for no-stage and multi-stage designs ("no staging" instead of "0 / 0 fired").
- [x] `bun run typecheck` (svelte-check, 0 errors, 0 warnings), `bun run build`, `bun test`, `bun run docs:check`, `bunx prettier --check` in `apps/web` all pass.
- [x] `[manual]` Screenshots at 1920x1080 and 1280x720 in `docs/journal/assets/021-*.png`: pad, ascent, staging toast, orbit, map view with Ap/Pe markers, pause menu, script panel, help overlay; each exists and is referenced from the journal.
- [x] `[manual]` Keyboard-only operation: Tab reaches every HUD control with a visible focus ring; Esc opens/closes the pause menu and traps focus; warp, map, script, help, speed mode work from the keyboard (recorded in the journal).
- [x] Contrast of every text token on its panel background is at least 4.5:1 (script computes it; table in the journal; `bun run --filter @orbital/web test` includes the check).
- [x] `prefers-reduced-motion: reduce` disables toast slide and warp-pip animation (CSS check by a test that reads `tokens.css`).
- [x] Known problems fixed: no "Untitled vessel" (named craft), no "Stage 0 / 0 fired", surface speed ~0 on the pad.
- [x] Per-frame HUD update does not use Svelte reactivity (navball and bars drawn from rAF); measured HUD paint cost per frame recorded in the journal.
- [x] Written self-review against `product/visual-direction.md` in the journal, including what still falls short.

## Docs checklist

- [x] `docs/STATUS.md`, journal, ADR 0026, research (`web-client.md`, `stack-versions.md`), `docs/architecture/overview.md` (web client UI section), draft plan 024 + board row.

## Log

- 2026-10-16 — Created as draft at the human's request (visual overhaul, code-only).
- 2026-10-16 — Refined draft -> ready at the human's request (session: hud session). Criteria made measurable (kept every draft item, nothing weakened); ADR 0026 written; fonts and Svelte patterns verified (research).
- 2026-10-16 — Implemented. Evidence per criterion: (1) `bun run --filter @orbital/web test`: 20 files, 146 tests pass (delta-v: Tsiolkovsky vacuum and sea level to 1e-9 plus a live `createSim` run after 10 s of burn and after separation; speed: surface 0 on a surface-rails state, inertial minus rotation otherwise; navball: six orientations, markers, brute-force ground-region check; formatters; toasts; orbit-info vs kepler propagation; vessel naming; sim-host pause and event forwarding; stage stack empty states; map projection pinned to the renderer's own camera). Guards verified by breaking them: flipping the east sign fails 5 navball tests, swapping vacuum for sea-level thrust fails the Δv tests. (2) `bun run typecheck` 0 errors 0 warnings, `bun run build` ok, `bun test` 573 pass, `bun run docs:check` ok, `bunx prettier --check .` ok in `apps/web`. (3) 19 screenshots `docs/journal/assets/021-*.png` at 1920x1080 and 1280x720 (pad, ascent, staging toast, orbit, map with markers, pause, script, controls, VAB, lost). (4) Keyboard path recorded in the journal. (5) Contrast table in the journal, enforced by `src/lib/ui/tokens.test.ts` (34 cases, all >= 5.56:1). (6) Reduced motion: the same test file checks the media block. (7) "Untitled vessel", "Stage 0 / 0 fired", 174.5 m/s and "altitude 7.5 m" on the pad are gone (screenshots, unit tests). (8) Navball and map markers are painted from the render loop; measured 0.17 to 0.30 ms per frame on average. (9) Self-review in the journal.
- 2026-10-16 — Deviations: the stage stack lists the first stage at the bottom (own layout, not KSP's numbering); Δv covers the stock engine, decoupler and store modules only (draft plan 024); map markers mirror the renderer's map camera until `Renderer.project` exists (draft plan 024); `hud.stagesDone/stagesTotal` fields of `FlightHud` were removed (stage progress is in `HudModel.stages`).
