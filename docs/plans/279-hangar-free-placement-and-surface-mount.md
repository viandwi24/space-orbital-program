---
id: 279
title: "Hangar free placement: move and rotate gizmos, offset field (format 4), free mode, docking ports anywhere"
status: draft
owner: ""
depends: []
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 279 — Hangar free placement: move and rotate gizmos, offset field (format 4), free mode, docking ports anywhere

## Goal

In the Hangar any part can be moved in x, y, z and rotated freely with gizmos (snap, fine snap, local/absolute), within a touch bound or freely in free mode; designs save the offset in format 4; a docking port tilted or offset docks along its own axis.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0258
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** `offset` in the design schema and resolver (`packages/core`), migration 3→4, gizmos and keys in `apps/web/src/lib/vab/` and the renderer view, tilt sliders unlimited, free-mode toggle and the launch-check warning, docking with tilted ports.
**Out:** New parts.

## Design notes

Gizmos are drawn by the renderer's VAB view (Three.js), driven by the controller; keys go through the key profile (`keybindings.ts`).

## Steps

1. Schema, resolver, migration with tests.
2. Gizmos, keys, snapping, frames.
3. Bound check and free mode.
4. Docking test with ports tilted 90 degrees.

## Acceptance criteria

- [ ] `bun test packages/core` passes, including format 3 designs resolving identically after migration to 4.
- [ ] Two vessels with docking ports tilted 90° about different axes dock and undock (`bun test packages/sim`).
- [ ] e2e: moving a part 0.5 m with the gizmo and saving reloads it at the same place.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/279-hangar-free-placement-and-surface-mount.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
