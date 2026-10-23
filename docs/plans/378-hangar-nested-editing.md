---
id: 378
title: "Hangar nested editing: outline selection, inside mode, a section cut, pick-through"
status: done
owner: "hangar placement UX session (Claude, 2026-10-23)"
depends: [315, 348, 356]
phase: 7
created: 2026-10-23
updated: 2026-10-23
---

# 378 — Hangar nested editing

## Goal

The owner (2026-10-23): editing inside a bay or a capsule is hard. The selected shell (the Wayfarer's keel, Kronos V's petals) paints its green highlight over everything inside, and clicks hit the shell. Make nested parts easy to see, pick and edit, as 3D editors do with groups.

## Context

- ADR 0315 (this plan), ADR 0297, plan 315 (`editor/inside.ts`), plan 356 (orbiter bay)
- `packages/renderer/src/vab/highlight.ts`, `part-layer.ts`, `view.ts`; `apps/web/src/lib/vab/controller.svelte.ts`, `PartList.svelte`, `SelectionCard.svelte`, `BuildContext.svelte`

## Scope

In: outline selection and hover; pick reach through open, see-through and entered shells; inside mode with a breadcrumb; a section cut; pick-through by clicking again with a list.
Out: e2e (owner's instruction); Zen mode and the sandbox Hangar (plan 375's session).

## Steps

1. Plan and ADR 0315.
2. Renderer: a stencil silhouette outline (`select`, `hover`, `flag`) in place of the fill; the stencil buffer in the WebGL renderer and the composer; warm compile.
3. Renderer: `reach` and `veil` on `VabPart`, `dim`; pick reaches held parts through a reaching shell; `pickAll` lists every part under the pointer, front to back.
4. Web: `inside-mode.ts` (pure) and the controller: a double click, "Edit inside", the Parts list, Esc, and a breadcrumb.
5. Web: `pick-cycle.ts` (pure) and the pick list popover.
6. Renderer and web: the section cut (a shared clipping plane, turned with the camera) and its toggle.
7. Check the Wayfarer Shuttle bay and Kronos V in the browser, with screenshots; docs; push.

## Acceptance criteria

- [x] `bun test packages/renderer` passes tests for the outline look (no fill inside the footprint: the outline material does not draw where the stencil is set) and the clipping plane's off position.
- [x] `cd apps/web && bunx vitest run src/lib/editor/inside-mode.test.ts src/lib/vab/pick-cycle.test.ts` passes tests for: enter by double click on a shell and on a held part; Esc and the breadcrumb leave; deleting the shell leaves; picks inside are limited to held parts; a repeated click goes to the next part behind and wraps; a click elsewhere starts over.
- [x] In the dev Hangar on the Wayfarer Shuttle and Kronos V: a selected shell shows an outline and the parts inside stay clear (screenshot); a part inside the bay can be selected by a click; inside mode shows the breadcrumb and Esc leaves it; Section cuts the near half.
- [x] `bun run typecheck`, `bun run docs:check`, `bun run build` pass.

## Docs checklist

- [x] ADR 0315, indexed.
- [x] `docs/STATUS.md` board row, journal `docs/journal/378-hangar-nested-editing.md`.
- [x] Keys: the Build sheet (double click, click again, Section).

## Log

- 2026-10-23: written.
- 2026-10-23: done. Renderer tsc clean; `bun test packages/renderer` 802 pass, 0 fail (vab-outline 6); svelte-check 0 errors in 2277 files; web vitest (vab, editor, keybindings, hud) 417 pass in 54 files (inside-mode 9, pick-cycle 5); `bun run build` OK. Dev Hangar: on the Wayfarer Shuttle the selected keel shows an outline only; a click inside the bay selects the crew cabin, a click again the docking port behind, with the pick list; a double click enters the keel (breadcrumb, veil, rest dimmed); on Kronos V a double click enters the petals, Esc leaves, Section cuts the near half. Screenshots in the session notes folder `screens-378/`.
