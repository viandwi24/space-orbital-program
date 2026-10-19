# 0207 — Hangar interaction model

**Status:** accepted
**Date:** 2026-10-18
**Plan:** plans/217-hangar-carry-loop.md, plans/218-hangar-inspector-groups-report.md, plans/219-procedural-fairings.md
**Builds on:** ADR 0205 (shared part inspector), ADR 0203 (node sizes, power budget)

## Context

The Hangar's data model works; its hand feel does not (research doc 02 §15, doc 05 §2). All state and input sit in `vab/controller.svelte.ts` (1418 lines). Surface attach is radial only, on cylinders and boxes, with angle, height and three keyboard stops (`state.ts:905,972,1040-1055`). There is no carried part on the cursor, no inherited symmetry, no action group editor and no fairings. Rancangan §8 and §8b.

## Decision

1. **Carry loop.** A picked part rides the cursor as a ghost. Nodes light up as it nears, it snaps, a click places it, and dropping it on the catalogue deletes it. Picking a placed part takes its subtree. Unattached assemblies may float. Alt-click copies. Surface attach works on any side of any part; holding Alt restricts to nodes.
2. **Symmetry 1–8 and mirror (R), inherited by children.** A part placed on a symmetric part gets the same symmetry. Placement, tweaks, staging and symmetry are one undo step each.
3. **Rotation** WASDQE, Shift for fine steps, Space to reset; C toggles angle snap.
4. **Turntable camera:** wheel moves up and down, Shift/Ctrl + wheel zooms, middle click focuses; pan for aircraft. The camera model never changes under the player.
5. **Gizmos show numbers.** Offset and rotate gizmos have local/global axes and typed fields (full gizmo set with re-root is P1; P0 has the numeric fields on the inspector).
6. **Shared inspector** (ADR 0205). An edit applies to every symmetry counterpart.
7. **Action group editor:** pick a group, click parts, pick the action.
8. **Δv and TWR per stage** with a body and situation picker; a **power budget** for day and night from core (ADR 0203 point 3).
9. **Pre-flight report** in the Hangar and Launch warns of: no control source, a pod without crew, a probe without an antenna, a crewed vessel without a parachute.
10. **Procedural fairings.** A fairing base per node size; click to add sections, 3D handles and numeric fields for radius and height; an interstage mode. Staging jettisons the fairing in flight. Parts inside are shielded from drag.
11. **Touch:** on-screen chips replace modifier keys and handles are 44 px.

## Alternatives considered

- **Keep click-to-select, then click-to-place** — rejected: it is the main reason the Hangar feels stiff.
- **Symmetry per part only** — rejected: rebuilding symmetry for each child is KSP's most tedious step.
- **Fixed fairing parts** — rejected: payloads vary; procedural fairings are standard since KSP 1.0.

## Consequences

- Plan 217's choices for points 1–4 and 11 are in ADR 0221.
- Plan 217 delivers points 1–4 and 11; plan 218 points 5–9; plan 219 point 10.
- The controller is split by concern while the carry loop lands.
- Fairing shielding adds an occlusion test to part drag.
