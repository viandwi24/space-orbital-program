---
id: 024
title: "Tooling hooks: module descriptors for delta-v and Renderer.project"
status: draft
owner: ""
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

**In:** an additive SDK/core field on `ModuleDefinition` (for example `describe?(config): ModuleInfo` with `engines`, `separates`, `stores`), used by `delta-v.ts` instead of the stock module ids; API version patch bump with ADR; `Renderer.project` implemented with the real camera and used by the HUD instead of the mirror; tests for both; docs (guide, spec).
**Out:** radial attachment and crossfeed rules beyond what the sim already has; new parts.

## Steps

1. ADR for the descriptor shape (what a tool needs: per engine thrust, isp(p), propellant ratios; per separator the node it severs; per store the resources).
2. Implement in core/sdk, port stock modules, switch `delta-v.ts`; keep the Tsiolkovsky tests green.
3. `Renderer.project`, switch `hud-controller.ts`, delete `map-projection.ts`.

## Acceptance criteria

- [ ] A test mod with its own engine module gets stage delta-v from `stageDeltaV` (Tsiolkovsky by hand).
- [ ] `bun test`, `bun run --filter @orbital/web test`, `bun run typecheck`, `bun run build`, `bun run docs:check` pass.
- [ ] `[manual]` Ap/Pe markers sit on the orbit line in map view at 1920x1080 and 1280x720 after the mirror is removed.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, ADR, `docs/guides/writing-a-mod.md`, `docs/architecture/overview.md`.

## Log

- 2026-10-16 — Created as draft by plan 021 (scope pushed out of the HUD plan).
