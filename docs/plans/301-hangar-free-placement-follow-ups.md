---
id: 301
title: "Hangar free placement follow-ups: the root part, plane handles, e2e"
status: draft
owner: ""
depends: [279]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 301 — Hangar free placement follow-ups: the root part, plane handles, e2e

## Goal

Finish what plan 279 left out of ADR 0258: the root part can be rotated (and the vessel re-rooted), the move gizmo has plane handles, and the gizmo is covered by an e2e test.

## Context

- ADRs: 0258, 0071
- Journal: `docs/journal/279-hangar-free-placement-and-surface-mount.md` (Not done)
- Code: `packages/core/src/design.ts` (`resolveVesselDesign` ignores the root's tilt and offset), `apps/web/src/lib/editor/state.ts` (`setPlacement`), `packages/renderer/src/vab/gizmo.ts`.

## Scope

**In:** a root tilt that turns the whole vessel's design frame (or a re-root of the vessel on another part, KSP's root tool); plane handles (XY, YZ, ZX) on the move gizmo; offsets of the inner parts of a mirrored sub-assembly copy reflected like the root's; the e2e test of plan 279 (move a part 0.5 m with the gizmo, save, reload: same place), once the owner allows e2e runs again.
**Out:** New parts.

## Steps

1. Decide root tilt versus re-root in an ADR.
2. Plane handles: pick by screen distance to the handle square, drag in the plane.
3. Mirror the inner offsets of a mirrored copy.
4. e2e test.

## Acceptance criteria

- [ ] The root's rotation (or a re-root) resolves, launches upright and saves.
- [ ] A plane handle moves a part in two axes at once.
- [ ] e2e: moving a part 0.5 m with the gizmo and saving reloads it at the same place.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/301-hangar-free-placement-follow-ups.md` written.
- [ ] New ADRs written for any decision made here, linked above.

## Log

- 2026-10-21 — Drafted from plan 279's leftovers.
