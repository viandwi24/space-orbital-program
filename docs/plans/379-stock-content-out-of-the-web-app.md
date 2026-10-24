---
id: 379
title: "The web app's own content moves into plugins: lessons and loading shots (blueprints done)"
status: done
owner: "Worker C"
depends: [375, 377]
phase: 8
created: 2026-10-23
updated: 2026-10-24
---

# 379 — The web app's own content moves into plugins

## Goal

ADR 0311 says content comes from plugins and stock is one plugin among them. Plan 375 moved the crew, and the blueprints moved ahead of this plan (ADR 0316: `mods/stock/src/blueprints.generated.ts`, registered through `blueprints` in `packages/core/src/plugin.ts` ~551).

Two kinds of content are still built into `apps/web` and cannot be replaced, extended or inspected by a mod:
- the lessons, the first-flight guide and the Space Center tour's hand-off to them;
- the loading-screen shots.

When this is done, stock registers both through plugin registries and the developer tools list them by plugin.

## Context

- ADR 0311 point 5 (the hard-coded table); plan 375 (developer tools by plugin); ADR 0316 (blueprints, done).
- `packages/core/src/plugin.ts`: the registrars (~517–564) have no `lessons` or `loadingShots` yet.
- Lessons: `apps/web/src/lib/onboarding/lessons.ts`, `lessons-basics.ts`, `lessons-flight.ts`, `lessons-advanced.ts`, `lesson-kit.ts`, `lesson-world.ts`, `lesson-vessels.ts`, `lesson-gate.svelte.ts` (blocked actions and places), `tutorial.ts` (the first-flight guide).
- The tour and the hand-off: plan 377 / ADR 0314 (`sc-tour.ts`, `sc-tour-store.svelte.ts`), ADR 0328 (3bd7a515: the tour ends on Fly here or A lesson; the guide waits while the tour is on).
- Loading shots: 10 images in `apps/web/static/loading/` (221234cc), listed in `apps/web/src/lib/loading-slides.ts`.
- Image assets in packages: format 3 (`docs/guides/writing-a-mod.md` ~441).

## Scope

**In:**
- **Lessons.** A `lessons` registry: steps as data, checks as pure functions of the snapshot and the Hangar state, and the hooks the gate, the guide and the tour hand-off use (blocked actions, the Hangar lesson the tour opens). Stock registers today's lessons.
- **Loading shots.** A `loadingShots` registry of image assets (format 3). Stock registers the 10 shots.

**Out:**
- Blueprints (done, ADR 0316).
- Part generators; building meshes (ADR 0311 keeps them as engines).
- The tour's own steps (Space Center UI).

## Steps

1. ADR: the `lessons` and `loadingShots` registry shapes, and which tour and gate hooks a lesson declares.
2. The lessons registry in core; stock's lessons move out of `apps/web`; the gate, the guide and the tour hand-off read the registry.
3. The loading shots registry; stock ships the 10 images as assets.
4. Developer tools list both by plugin; the mod guide gets both sections.

## Acceptance criteria

- [x] `bun test packages/core` passes a test registering a lesson and a loading shot from a plugin.
- [x] `cd apps/web && bunx vitest run src/lib/onboarding` passes (lessons, tour, tutorial tests) with lessons read from the registry.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md`; journal; ADR; `docs/guides/writing-a-mod.md` (lessons, loading shots).

## Log

- 2026-10-24 — Loading shots done (Worker C, ADR 0349, API 0.1.126): the `loadingShots` registry, stock's ten shots, the loading screen reads the registries, the guide. Lessons are not moved: their observation, `DebugApi` and Hangar-state types must go to the SDK first (journal 379).
- 2026-10-23 — Drafted from plan 375 (ADR 0311's later rows).
- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: partly done; blueprints shipped (ADR 0316); remaining lessons and loading shots registries; the lessons registry must cover the tour (377), the lesson gate and the onboarding hand-off (ADR 0328); shots are now 10; depends adds 377.
- 2026-10-24 — Lessons done (Worker C, ADR 0355, API 0.1.128): the `lessons` registry and the lesson types in core/SDK, stock's 20 lessons in `mods/stock/src/lessons/` with baked vessels, the app reads the registry (progress ids keep the short names). Tests: `core/test/lessons.test.ts`, `onboarding/*` (132 pass), `lesson-bake.test.ts`, `bun test mods/stock packages/sdk packages/core`. Plan done.
