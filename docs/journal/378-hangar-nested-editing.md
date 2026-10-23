# 378 — Hangar nested editing

**Plan:** [plans/378-hangar-nested-editing.md](../plans/378-hangar-nested-editing.md) · **Session:** hangar placement UX session (Claude) · **Date:** 2026-10-23 · **ADR:** 0315

## What was done

- Renderer `highlight.ts`: `outline(kind)` returns three passes (a stencil footprint, a dim ring drawn behind others, a bright ring in front). The ring is the mesh pushed out along its normals by a fixed number of screen pixels, and it is drawn only where the footprint is not. Select is 3 px, hover 1.5 px, flags 4.5 px red. The rim fill (`get()`) stays for flight. There are new `veil` and `dim` looks, and `sectionPlanes()`.
- `part-layer.ts`: every part material clips by one shared plane from the moment the part is built. `VabPart` gains `reach`, `veil` and `dim`. A see-through shell (hover, Show payload) is now the faint veil instead of the bright green x-ray. That x-ray was the green that covered the bay.
- `view.ts`: the stencil buffer is on in the VAB renderer and the composer target, with local clipping. `pickAll` lists the parts under the pointer front to back. The pick reaches through open and entered shells, never picks the veil, and skips hits the section hides. `setSection` places the cut plane each frame, facing away from the camera, through the vessel axis. `frameOn` frames a part.
- Web:
  - `editor/inside-mode.ts`, the state machine (double click, the list, Edit inside, exit, design change), plus the pick and look rules.
  - `vab/pick-cycle.ts`, click again at the same spot.
  - The controller wires them in: `entered`, `pickList`, `section`, `clickPart`, and the debug hook `inside()`/`shells()`.
  - `PickList.svelte`; the breadcrumb chip in `BuildContext`; Inside on the selection card; the Parts list enters the shell; a Section toggle in the tool pill; rows in the Build keys sheet.

## What surprised me

- three's clipping chunk reads a variable named `mvPosition`; a ShaderMaterial that names it otherwise fails to compile once a clipping plane is set.
- The owner's "green" was the hover x-ray of a see-through shell (additive, depth test off), not the selection, which is cyan.
- In a hidden browser pane the Hangar draws no frames; checks drove `renderFrame` by hand and posted canvas captures to a local receiver.

## Verification output

Recorded in the plan's Log.

## Open questions

- The outline hull has small gaps at hard edges (split normals); a smoothed-normal attribute would close them.
- The section plane always faces the camera; a fixed, rotatable plane could follow if players ask.
