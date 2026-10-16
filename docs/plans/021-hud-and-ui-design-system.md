---
id: 021
title: "UI: design system and flight HUD"
status: draft
owner: ""
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

## Steps

1. Refine (verify Svelte 5 / SvelteKit 3 patterns, font licences, any library you add); ADR for the design system and HUD architecture (render loop vs Svelte reactivity, update throttling).
2. Implement; vitest tests for derivations (Δv per stage, speed mode, navball angles, formatters).
3. Screenshots; journal.

## Acceptance criteria

- [ ] To be made measurable at refinement. Must include: vitest tests for the pure HUD maths (stage Δv vs Tsiolkovsky for the two-stage vessel, surface speed ≈ 0 on surface rails, navball attitude angles for known orientations, unit formatting); `[manual]` screenshots of pad, ascent, staging toast, orbit, map view, pause menu at 1920×1080 and 1280×720 in `docs/journal/assets/021-*.png`; keyboard-only operation of the HUD controls; contrast check of text tokens (AA) recorded; self-review; all repo checks pass.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, ADR, research, `docs/architecture/overview.md` (web client UI section).

## Log

- 2026-10-16 — Created as draft at the human's request (visual overhaul, code-only).
