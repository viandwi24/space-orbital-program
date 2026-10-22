# 0297 — Hangar placement: the vessel never moves while carrying, snap by screen radius with hysteresis, a Root tool

**Status:** accepted
**Date:** 2026-10-22
**Plan:** plans/348-hangar-placement-ux.md
**Builds on:** ADR 0207 (carrying), ADR 0235 (surface links, rings in reach), ADR 0258 (free placement, tools and gizmo)

## Context

The owner saw the whole rocket jump up and down while carrying a stack part beside it. Two causes (research note `research/ksp-editor-placement.md`):

1. The view stood each group on the floor from **all** its parts, ghosts and the free cursor ghost included. A ghost below the vessel lifted it.
2. With no ring and no surface under the pointer, or with the pointer over the ghost itself, the ghost fell back to the keyboard cursor's target (the last part's bottom node). The ghost appeared under the vessel, lifted it, left the pointer, and the fallback flipped back.

## Decision

1. **Only solid parts stand a group on the floor.** Ghost and free parts never change a group's height. A ghost may sink into the platform. A drop that adds a part below the vessel raises it once, with the existing ease.
2. **The pointer picks the candidate, never a default.** While the pointer drives, a node is a candidate only when its ring is within the snap radius on screen. Otherwise the held part takes the surface under the pointer (a surface link, plan 244) or floats at the cursor. The keyboard's cursor target shows only after a keyboard step (Tab, `[`/`]`) until the pointer moves again.
3. **Over the ghost nothing changes.** The previous candidate stays.
4. **Hysteresis.** A snapped ring stays snapped until the pointer leaves 1.5× the snap radius, or another ring is at most 60 % of its distance. Pure function `nextPlacement` in `apps/web/src/lib/vab/placement-pick.ts`, unit-tested.
5. **A Root tool (4).** Clicking a part makes it the root: every link on the path from it to the old root is turned over. Only node-to-node links may be on that path (no radial or surface link, no tilt or offset), as in KSP. One undo step. Pure function `reroot` in `apps/web/src/lib/editor/reroot.ts`.
6. **Right-click without a drag drops a carried new part back to the catalogue** (a carried placed part goes back where it was, as Esc). Right-drag still orbits.
7. **A help overlay** opened by `?` or F1 (a new `vab` action `hangarHelp`) or a `?` button on the tool pill lists the Hangar keys from the keymap's Build, Carrying and Tools sheets, so a rebound key shows as bound.

## Consequences

- No vessel motion from hover; the drop may still raise the vessel once (smoothly).
- A part held below the vessel shows partly under the floor until dropped.
- The re-root refuses radial/surface paths with a notice; a later plan may support them.
