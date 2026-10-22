---
id: 348
title: "Hangar placement UX: no vessel jump while carrying, screen-radius snap with hysteresis, Root tool, right-click drop, keys overlay"
status: done
owner: "hangar placement UX session (Claude, 2026-10-22)"
depends: [217, 244, 279]
phase: 7
created: 2026-10-22
updated: 2026-10-22
---

# 348 — Hangar placement UX

## Goal

The owner (2026-10-22): make the Hangar's placement smoother, as KSP does it; and fix the glitch where carrying a stack part beside a rocket in the middle of the Hangar makes the rocket jump up and down.

## Context

- Research: `research/ksp-editor-placement.md` (this plan)
- ADR 0297 (this plan's decisions); ADR 0207, ADR 0235, ADR 0258
- `apps/web/src/lib/vab/controller.svelte.ts`, `apps/web/src/lib/editor/scene.ts`, `packages/renderer/src/vab/view.ts`, `scene-model.ts`

## Scope

In: the floor shift from solid parts only; a pure `nextPlacement` with screen-radius snap and hysteresis; no default-target fallback while the pointer drives; a Root tool with a pure `reroot`; right-click drop; a keys overlay.
Out: re-rooting through radial or surface links; symmetry around the vessel versus the parent (F in Place mode); e2e (skipped on the owner's instruction).

## Steps

1. Research note, this plan, ADR 0297.
2. `standingLows` in `scene-model.ts`: only `solid` parts count; the view uses it. Test.
3. `placement-pick.ts` `nextPlacement`: node hit, ring in snap radius with hysteresis, surface site, free point, over-ghost keeps. Tests. The controller uses it; the keyboard cursor shows only in keyboard mode.
4. `editor/reroot.ts` `reroot` with tests; the Root tool (key 4, tool pill button), one undo step.
5. Right-click (no drag) while carrying: back to the catalogue (new part) or put back (Esc).
6. Keys overlay (`?`/F1 and a pill button).
7. Docs, checks, commit, push.

## Acceptance criteria

- [x] `bun test packages/renderer` passes a test that a ghost or free part below the vessel does not change the group's floor shift.
- [x] `cd apps/web && bunx vitest run src/lib/vab/placement-pick.test.ts` passes tests for: node within snap radius snaps; no node in radius → surface site, else free point; over the ghost keeps the previous; hysteresis keeps a ring until 1.5× radius; a much nearer ring takes over.
- [x] `cd apps/web && bunx vitest run src/lib/editor/reroot.test.ts` passes: a stack path turns over, the layout keeps every part's relative position, a radial path is refused.
- [x] Headless repro in the dev Hangar with `window.__orbitalVab`: the main group's height stays the same while the pointer moves beside the booster.
- [x] `bun run typecheck`, `bun run docs:check`, `bun run build` pass.

## Docs checklist

- [x] Research `docs/research/ksp-editor-placement.md`.
- [x] ADR 0297, indexed.
- [x] `docs/STATUS.md` board row, journal `docs/journal/348-hangar-placement-ux.md`.
- [x] Keys: the Build and Tools sheets in `keybindings.ts` (shown in Settings → Controls and the Hangar keys overlay).

## Log

- 2026-10-22: written; research done (web, KSP wiki key list and forums).
- 2026-10-22: done. Renderer vab tests 19 pass; web vitest (placement-pick 8, reroot 3, keybindings, vab, scene, carry) 90 pass; svelte-check 0 errors in 2189 files, renderer tsc clean. Dev Hangar: over a pointer sweep beside the booster the old floor rule gave 9 heights, the new one 1; Root on a core tank works, on a booster is refused; right click lets go; the keys overlay opens.
