---
id: 279
title: "Hangar free placement: surface attach anywhere, offset (format 4), Move and Rotate tools with a gizmo, free mode, tilted ports dock"
status: done
owner: "worker (Claude)"
depends: []
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 279 — Hangar free placement: surface attach anywhere, offset (format 4), Move and Rotate tools with a gizmo, free mode, tilted ports dock

## Goal

In the Hangar any part can be put on any visible face at the cursor, moved in x, y and z and rotated freely with the keyboard (KSP's 2 and 3 tools) or a gizmo, within a touch bound or freely in free mode; designs save the offset in format 4; a docking port tilted or offset docks along its own axis.

## Context

- ADRs: 0258 (Consequences record what was built differently), 0235 (surface links), 0071 (format 3, tilt), 0034 (radial, symmetry), 0218 (docking).
- Code: `packages/core/src/design.ts`, `protocol*.ts`; `apps/web/src/lib/editor/state.ts`, `bounds.ts`, `checks.ts`; `apps/web/src/lib/vab/controller.svelte.ts`, `tool-keys.ts`, `ToolPill.svelte`, `SelectionCard.svelte`, `BuildContext.svelte`; `apps/web/src/lib/keybindings.ts`; `packages/renderer/src/vab/gizmo.ts`, `view.ts`.

## Scope

**In:** `offset` and `freePlacement` in the design schema and resolver, migration 1–3 → 4; editor operations (offset, free tilt, symmetry copies as mirror images, local/absolute nudges and turns); the touch bound and free mode with a launch-check warning; the Move and Rotate tools on the keyboard (key profile, help group) and a draggable gizmo (arrows, rings); a snap-to-nodes toggle and radial sites only on the collider's side; tilt sliders to ±180°; sim tests (moved part's pose, mass, CoM; tilted ports dock and undock).
**Out:** New parts; the root's rotation or re-rooting, plane handles, the e2e test (plan 304).

## Design notes

The offset is in the parent's axes and is added after the attach transform; the tilt pivots about the moved attach point. A rotation in the tool's axes `B` gives the new tilt `P⁻¹ B P T` (P the parent's rotation, T the old tilt); `tiltOfMatrix` reads the angles back. The gizmo is drawn by the renderer's VAB view from `VabScene.gizmo` and picked by screen distance; the controller turns a drag into an offset (pixels along the projected axis) or a turn (the pointer's angle about the gizmo centre), previewed live and committed as one undo step.

## Steps

1. Schema, resolver, migration with tests.
2. Editor operations, bound and free mode, launch check.
3. Keys, tools, gizmo, snap toggle, UI.
4. Sim tests: moved part; ports tilted 90° dock and undock.

## Acceptance criteria

- [x] `bun test packages/core` passes, including format 3 designs resolving identically after migration to 4 (`design-offset.test.ts`).
- [x] Two vessels with docking ports tilted 90° about different axes (Z and X) dock and undock (`bun test packages/sim/test/free-placement.test.ts`).
- [x] Moving a part and saving reloads it at the same place: unit test (`placement.test.ts`, serialise and parse); the e2e version is plan 304 (the owner asked not to run e2e).
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass (Log).
- [x] Screenshots of new parts: none, the plan adds no part.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, recent journal).
- [x] `docs/journal/279-hangar-free-placement-and-surface-mount.md` written.
- [x] Affected `docs/architecture/*.md` updated (`plugin-system.md`: design format 4, API 0.1.97).
- [x] ADR 0258 Consequences record the differences; no new ADR.
- [x] `docs/research/stack-versions.md`: nothing looked up.
- [x] `refs/part-visuals-and-blueprints/parts-tracker.md`: the ADR 0258 row marked done (279 ✅).

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner).
- 2026-10-21 — Done (worker session). See the journal for what was built, the keys and the verification output.
