---
id: 217
title: "Hangar: carry loop, symmetry, rotation, turntable camera"
status: draft
owner: ""
depends: []
phase: 7
created: 2026-10-18
updated: 2026-10-18
---

# 217 — Hangar: carry loop, symmetry, rotation, turntable camera

## Goal

Building in the Hangar feels like KSP's VAB. A part rides on the cursor; nodes light up as it nears them and it snaps; a click places it; dropping it on the catalogue deletes it. Picking up a part takes its children. Loose assemblies float. Alt-click copies. Parts attach to any surface side, and holding Alt forces node-only. Symmetry 1–8 and mirror (R) are inherited by children, and a symmetric placement is one undo step. WASDQE rotate the carried part (Shift for fine steps, Space to reset), and C toggles angle snap. The camera is a turntable: the wheel moves up and down the vessel, Shift or Ctrl + wheel zooms, a middle click focuses.

## Context

- Rancangan §8.1–8.5, §8 "Better than KSP" (snap steps, one undo step, a camera model that never changes), touch note (on-screen chips for modifiers, 44 px handles).
- ADRs: 0207 (Hangar interaction model: carry loop, inherited symmetry), 0029 (VAB editor state and hangar view, loose assemblies), 0034 (radial attachment, symmetry and design format 2), 0071 (format 3, tilt), 0148 (verdict levels and tool pill).
- Research:
  - 02 §2–5: KSP1/KSP2 camera, carry loop, attach rules, Alt-copy, symmetry inheritance, rotation keys and angle snap, with the KSP2 complaints to avoid.
  - 05 §2 table: placement is click-to-arm then click (`apps/web/src/lib/vab/controller.svelte.ts:775`, ghost from `buildScene` `:297-313`, pick order `packages/renderer/src/vab/view.ts:627-656`); surface attach is radial only on cylinders and boxes (`apps/web/src/lib/editor/state.ts:905,972,1040-1055`); symmetry ×1/2/3/4/6 only while armed (`state.ts:184`, `controller:1347-1354`), no mirror; angle snap fixed at 15° with Alt to disable (`state.ts:954-970`); camera distance 2.5–60 m, max pitch 1.35 rad, pan in a 14 m box (`packages/renderer/src/vab/orbit-camera.ts:28-36`).
  - 05 §2.1: every VAB binding (`apps/web/src/lib/keybindings.ts:120-132`), including X symmetry, Q/E turn, M/G carry.
- No plan dependency; plan 218 builds on this, and plan 216's profiles cover the Hangar's keys.

## Scope

**In:**
- Carry state in the editor: a held subtree that follows the pointer, with a ghost; node highlight within a screen radius; snap; click to place; drop on the catalogue to delete.
- Pick-up of a placed part takes its subtree; dropping in empty space leaves a loose assembly (ADR 0029 idea, now under the cursor).
- Alt-click copies the subtree with its symmetry; Shift-click picks the whole vessel.
- Surface attach on any side of any part with a collider shape (cylinder, box, cone), oriented to the surface normal; Alt held means node-only.
- Symmetry counts 1–8 (X up, Shift+X down) and mirror (R toggles radial/mirror). A part placed on a symmetric parent inherits the parent's symmetry. The whole set is one undo step.
- Rotation of the carried part: W/S pitch, A/D roll, Q/E yaw, 90° steps; Shift for 5°; Space resets. C toggles angle snap (15°, 5° with Shift).
- Turntable camera: wheel moves the focus height along the vessel axis; Shift or Ctrl + wheel zooms; middle click focuses a part; Shift + middle drag pans for aircraft; pitch stays clamped.
- Touch: on-screen chips for Alt, Shift and Symmetry; 44 px handles.
- Bindings for these in the `vab` scope of the key table.

**Out:**
- Inspector, action group editor, Δv by body, power budget, report and crew (plan 218).
- Offset and rotate gizmos with numbers, re-root, part tree list (P1, §8.11).
- Fairings (plan 219); room size (plan 220).
- Automatic adapter offer (P1, rancangan §8b.6).

## Touches

- **Size:** L
- **Edits:**
  - `apps/web/src/lib/editor/state.ts` (carry state, subtree pick-up, copy, surface attach on any side, symmetry 1–8 and mirror with inheritance, rotation, one-step undo) and tests
  - `apps/web/src/lib/editor/assembly.ts` (loose assemblies under the cursor)
  - `apps/web/src/lib/vab/controller.svelte.ts` (pointer and key loop)
  - `apps/web/src/lib/vab/Catalogue.svelte` (drop to delete), `apps/web/src/lib/vab/ToolPill.svelte` (symmetry 1–8, mirror, snap chips)
  - `packages/renderer/src/vab/view.ts`, `packages/renderer/src/vab/picking.ts` (surface hit with normal on any side, node screen radius), `packages/renderer/src/vab/orbit-camera.ts` (turntable height, zoom modifier, focus)
  - `apps/web/src/lib/keybindings.ts` (vab actions)
  - `packages/core/src/protocol.ts`, `packages/core/src/design.ts` (symmetry group mode `radial | mirror`; surface link on any side)
- **Shared contracts:** design format: a symmetry group mode and a general surface link (normal and point on the parent) are additive fields, or format 4 if ADR 0207 says so, with a migration from 3. `migrateVesselDesign` stays the only entry point. Plan 219's fairing and 218's inspector read the new editor state.

## Design notes

- Keep the editor pure: `state.ts` gets `carry`, `drop`, `rotateCarried`, `pickUp`, `copy` functions; the controller only maps input to them.
- Inheritance rule: if the target parent belongs to a symmetry group of n, the placed part is copied onto each of its n siblings with the group's mode, regardless of the current count setting (KSP1 VAB behaviour). The count setting applies only to placement on a non-symmetric parent.
- Mirror symmetry reflects across the vessel's XZ plane through the root axis (VAB: plane facing the camera at the start of placement).
- The turntable keeps today's limits; plan 220 widens zoom.
- Existing e2e `e2e/editor.e2e.ts` drives click-to-arm; keep a keyboard path (Enter places) so accessibility does not regress.

## Steps

1. Editor state: carry, pick-up with subtree, drop to delete, loose assemblies. Tests.
2. Surface attach on any side with normals; Alt for node-only. Renderer picking returns face normals.
3. Symmetry 1–8, mirror and inheritance; one undo step. Design format change and migration.
4. Rotation keys and angle snap toggle.
5. Turntable camera: wheel height, modifier zoom, middle-click focus, pan.
6. Controller wiring, key table, ToolPill chips, touch chips.
7. Update `e2e/editor.e2e.ts`; add the carry e2e.

## Acceptance criteria

- [ ] `apps/web` vitest `lib/editor/carry.test.ts`: picking up a tank with an engine below carries both; dropping on the catalogue deletes both; undo restores both in one step.
- [ ] `apps/web` vitest `lib/editor/symmetry.test.ts`: four radial boosters at symmetry 4, then a fin placed on one gives four fins in one undo step; mirror symmetry places two wings reflected; counts 5, 7 and 8 work.
- [ ] `bun test packages/core/test/design.test.ts packages/core/test/design-v3.test.ts` pass, with a new case: a format 3 design with symmetry groups migrates and resolves unchanged; a mirror group round-trips.
- [ ] `bun test packages/renderer/test/vab-picking.test.ts`: a ray to the side of a box part returns that face's normal.
- [ ] Chromium e2e `e2e/hangar-carry.e2e.ts`: pick a tank from the catalogue, it follows the pointer; hover over the pod's bottom node, it snaps; click places it; Alt-click it gives a copy on the cursor; dropping the copy on the catalogue removes it; the part count reads the same as before the copy.
- [ ] `e2e/editor.e2e.ts` passes on Chromium.
- [ ] `bun run check:affected` passes.
- [ ] CI is green on the plan's ready tag (full suite, ADR 0126).

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/217-hangar-carry-loop.md` written.
- [ ] `docs/architecture/overview.md` updated (editor carry model).
- [ ] Design format notes updated where ADR 0016/0034/0071 are summarised.
- [ ] New ADRs written for any decision made here, linked above.

## Log

- 2026-10-18 — Created from refs/rancangan-terpadu.md (release roadmap).
