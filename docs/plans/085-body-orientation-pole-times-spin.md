---
id: 085
title: "Body orientation as pole times spin (no behaviour change)"
status: in-progress
owner: "Agent 2"
depends: []
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 085 — Body orientation as pole times spin (no behaviour change)

## Goal

A body's orientation is `q_pole · Ry(W(t))` everywhere the code assumed a spin about +Y: rotation, surface placement, surface rails, ground tile, terrain lookups, SAS surface reference, navball horizon, latitude read-outs, rotation boost, renderer body transforms. With the identity pole and `W = ωt` every existing test passes unchanged.

## Context

- ADRs: 0103, 0007, [0145](../decisions/0145-body-rotation-pole-convention-and-one-function.md) (written here)
- Read: ADR 0103 point 4, ADR 0007, 0024, 0026 (navball frame), `docs/architecture/units-and-frames.md`, `packages/sim/src/orbit.ts` (`surfaceRails`, `orientationOf`), `terrain.ts`, `sas.ts`, `apps/web/src/lib/navball-math.ts`, renderer `scene.ts`.

## Scope

**In:**
- `BodyDefinition.rotation` optional: `{ pole: { ra, dec } | quaternion, w0, wDot, periodic? }`; defaults reproduce `Ry(ωt)`.
- One core function `bodyOrientation(body, t)` used by every site listed above.
- A test body with a 23.44 degree tilt: a surface-rails vessel stays put, a pad launch keeps the ground tile under it, the navball horizon is level on the pad.

**Out:** the Sun as root and seasons (122); real rotation data (123).

## Touches

- **Size:** M
- **Edits:** `packages/core`, `packages/sim`, `packages/renderer`, `apps/web/src/lib/navball-math.ts`, `apps/web/src/lib/hud`
- **Shared contracts:** **core types (`BodyDefinition.rotation`)**; no save change (orientation is a function of time)

## Design notes

Search for every `Ry(` / `omega` use and `+Y`-as-north assumption; list them in the journal with the replacement.

## Steps

1. Inventory of +Y-pole assumptions.
2. Core function and schema.
3. Replace call sites; all existing tests green.
4. Tilted test body scenarios.

## Acceptance criteria

- [x] All existing tests pass unchanged (identity default).
- [x] `packages/sim` test on a body tilted 23.44 degrees: a vessel on surface rails for 10 game days stays within 1e-6 m of its body-fixed position; a vessel loaded on the pad stands (no slide over 10 s).
- [x] `apps/web` vitest: the navball pitch on the pad of the tilted body is 90 degrees within 0.01.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/085-body-orientation-pole-times-spin.md` written.
- [x] `docs/architecture/units-and-frames.md`, `simulation.md`.
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0103, 0007).
- 2026-10-17 — Claimed by Agent 2 (Dev B, M2). Inventory (journal), `body-rotation.ts` and `BodyDefinition.rotation`, every sim site through `rotationAt`/`spinAt`, the web horizon and surface speed, ADR 0145, tilted-body tests. Verification on the M2, rebased on `origin/main`:
  - All existing tests unchanged: `bun test packages/sim packages/core` — 610 pass, 0 fail right after the replacement, before any new test; no existing test file edited.
  - `bun test packages/sim/test/body-rotation.test.ts` — 6 pass: identity default equals `qAboutY(2 pi t / P)` exactly; a 23.44 degree pole maps +Y onto the pole and the angular velocity lies along it; on the tilted home planet a pad vessel moves under 0.05 m body-fixed in 10 s and stands within 1 degree of vertical; after `warp-to` 10 game days on surface rails it is within 1e-6 m of its body-fixed place.
  - `bunx vitest run src/lib/tilted-navball.test.ts` — the navball pitch on the tilted pad is 90.00 degrees (to 0.005), and north follows the pole.
  - `bun test ./packages`, `./mods`, `./examples` — 1386, 93, 7 pass; `bunx vitest run` (apps/web) — 916 passed, 2 failed in `sim-host-script-worker.test.ts` (as on `origin/main` on this M2); `bun run typecheck` — 0 errors; build ok; `bun run docs:check` — OK; `playwright test e2e/smoke.e2e.ts e2e/launch.e2e.ts --project=chromium` — 7 passed (4.8 m).
  - `API_VERSION` 0.1.40 (additive `BodyDefinition.rotation`).
