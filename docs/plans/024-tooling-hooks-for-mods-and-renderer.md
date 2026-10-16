---
id: 024
title: "Tooling hooks: module descriptors for delta-v and Renderer.project"
status: done
owner: "tooling session (Claude, 2026-10-16)"
depends: [021]
phase: 2
created: 2026-10-16
updated: 2026-10-16
---

# 024 — Tooling hooks: module descriptors for delta-v and `Renderer.project`

## Goal

Two things plan 021 had to work around become proper interfaces: (1) the HUD's and VAB's stage delta-v (`apps/web/src/lib/delta-v.ts`) knows the stock engine and decoupler modules by id; a mod engine or separator contributes nothing until the SDK lets a module describe itself to tools (thrust and Isp curve, propellants, what staging does to the attach graph); (2) map markers (Ap/Pe/vessel) mirror the renderer's map camera in the page (`map-projection.ts`, ADR 0026) because the renderer has no projection method; `Renderer.project(world position) -> screen x/y | null` removes the mirror.

## Context

- Read: ADR 0026, journal 021, `apps/web/src/lib/delta-v.ts`, `apps/web/src/lib/map-projection.ts` (and its test, which pins the mirror to the renderer's camera), `docs/guides/writing-a-mod.md`, ADR 0013, ADR 0015.
- Needs the owners of plan 019/020 (renderer) to be done with `packages/renderer` or to agree on the file.

## Scope

**In:**

- An additive `ModuleDefinition.describe?(config, state): ModuleInfo` in core (re-exported by the SDK) with a zod schema (`moduleInfoSchema`) that validates what a module returns: `engine` (full-throttle `massFlow` kg/s, a `thrust` curve over ambient pressure, `propellants` by volume ratio, `ignited`, `flameout`) and `separator` (the attach `node` it severs when staged, `done`). Stores stay on the existing `ModuleDefinition.store`. API 0.1.6 to 0.1.7 (additive). Stock engine and decoupler describe themselves.
- `apps/web/src/lib/delta-v.ts` and the editor's auto-staging (`editor/staging.ts`) use the descriptors; neither names a stock module id or imports `@orbital/mod-stock`. `editor/part-info.ts` shows a mod engine's thrust and Isp from its descriptor.
- `Renderer.project(world) -> {x, y, hidden} | null`, backed by a pure `projectWorldPoint` and the scene's real camera; the HUD map markers use it and `map-projection.ts` is deleted.
- Tests for both; docs (guide, spec, ADR).

**Out:** radial attachment and crossfeed rules beyond what the sim already has (plan 026); new parts; mod-supplied VAB categories (plan 029); the HUD throttle gauge's engine lookup (`hud-model.ts` `vesselThrottle`, stays on the stock id with a fallback).

## Steps

1. ADR 0033 for the descriptor shape (per engine mass flow, thrust curve over pressure, propellant ratios; per separator the node it severs; stores via the existing `store`) and for `Renderer.project`.
2. Core: types, `moduleInfoSchema`, `describeModule` helper; SDK exports; API 0.1.7. Stock engine and decoupler `describe`. Switch `delta-v.ts`, `staging.ts`, `part-info.ts`; keep the Tsiolkovsky tests green.
3. `Renderer.project` (pure function in the renderer, scene and facade methods), switch `hud-controller.ts` and `flight-loop.ts`, delete `map-projection.ts` and its mirror test.
4. Docs, journal, STATUS.

## Acceptance criteria

- [x] Core tests: `moduleInfoSchema` accepts a full engine and a separator descriptor and refuses a curve that does not start at 0 Pa, is not ascending, has non-positive thrust or mass flow, empty propellants; `describeModule` parses the part config, passes fresh state or a given view, and names the module id when a descriptor is invalid. SDK type test: `defineModule({ describe })` infers config and state.
- [x] A test mod (`apps/web/src/lib/delta-v-mod.test.ts`) with its own engine module (own config schema, own propellant, a different thrust curve) and its own separator module (severs `bottom`) gets per-stage vacuum and sea-level delta-v from `stageDeltaV` equal to Tsiolkovsky by hand (relative error under 1e-9), and the editor's `autoStages` stages its engine and separator.
- [x] `grep -nE "stock\.|@orbital/mod-stock" apps/web/src/lib/delta-v.ts apps/web/src/lib/editor/staging.ts` prints nothing.
- [x] Stock two-stage delta-v unchanged: sea level 1,161 + 2,844 m/s, vacuum 1,244 + 3,047 m/s (journal 022), pinned in a test; VAB stats tests (`editor/stats.test.ts`) pass unmodified.
- [x] `projectWorldPoint` is unit-tested against a known camera (point at the target is the screen centre; offsets, behind-camera null, and body occlusion computed by hand); `Renderer.project` exists on the facade and the scene model, and the map markers use it: `grep -rn "map-projection\|createMapRigMirror\|MapRigMirror" apps/web/src` prints nothing and the file is gone.
- [x] `bun test`, `bun run --filter @orbital/web test`, `bun run typecheck`, `bun run build`, `bun run docs:check`, `bun run lint` pass.
- [x] `[manual]` Ap/Pe markers sit on the orbit line in map view at 1920x1080 and 1280x720 after the mirror is removed (screenshot `docs/journal/assets/024-map.png`).

## Docs checklist

- [x] `docs/STATUS.md`, journal, ADR 0033 and the decisions index, `docs/guides/writing-a-mod.md`, `docs/architecture/plugin-system.md`, `docs/architecture/overview.md`.

## Log

- 2026-10-16 — Created as draft by plan 021 (scope pushed out of the HUD plan).
- 2026-10-16 — Refined draft → ready at the human's request (session: tooling session).
- 2026-10-16 — In progress (tooling session). ADR 0033 written.
- 2026-10-16 — Done (tooling session). Commits: core (descriptors, API 0.1.7), stock, sdk, web (delta-v, staging, part facts), renderer (`Renderer.project`), web (markers). Journal 024, ADR 0033.
