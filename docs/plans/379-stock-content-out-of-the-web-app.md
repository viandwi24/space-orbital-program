---
id: 379
title: "The web app's own content moves into plugins: learn and mission blueprints, lessons, loading shots"
status: draft
owner: ""
depends: [375]
phase: 8
created: 2026-10-23
updated: 2026-10-23
---

# 379 — The web app's own content moves into plugins

## Goal

ADR 0311 says content comes from plugins and stock is one plugin among them. Plan 375 moved the crew. Three kinds of content are still built into `apps/web` and cannot be replaced, extended or inspected by mod:
- the five learn blueprints and the famous-mission blueprints;
- the lessons and the first-flight tutorial;
- the loading-screen shots.

## Context

- ADR 0311, point 5 (the hard-coded table), plan 375 (the developer tools that show where content comes from).
- `apps/web/src/lib/editor/examples.ts`, `missions.ts`, `blueprints.ts` (`allBlueprints`), `apps/web/src/lib/onboarding/lessons-*.ts`, `apps/web/static/loading/`, `src/lib/loading-slides.ts`.

## Scope

**In:**
- **Blueprints.** Stock registers the learn and mission blueprints. They build through editor operations today, so either:
  - `BlueprintDefinition` gains an optional `build(content)` beside `design`, or
  - the designs are baked to JSON at build time and checked by a test.
  
  An ADR decides which.
- **Lessons.** A `lessons` registry: steps as data, and checks as pure functions of the snapshot and the Hangar state.
- **Loading shots.** A `loadingShots` registry of image assets (format 3).

**Out:**
- Part generators.
- Building meshes (ADR 0311 keeps them as engines).

## Steps

1. ADR: how a blueprint that is built rather than stored is registered.
2. Move the learn and mission cards to stock. `/developer/blueprints` then shows them `by stock`.
3. The lessons registry and stock's lessons.
4. The loading shots registry.

## Acceptance criteria

- [ ] `/developer/blueprints` lists no blueprint `by game`.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, the mod guide (lessons, loading shots), ADR.

## Log

- 2026-10-23 — Drafted from plan 375 (ADR 0311's later rows).
