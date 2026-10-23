# 312 — Blueprint Library follow-ups

**Plan:** [plans/312-blueprint-library-follow-ups.md](../plans/312-blueprint-library-follow-ups.md) · **Session:** Worker C, 2026-10-24 · **ADR:** [0263](../decisions/0263-blueprints-are-mod-content-in-one-library.md) (no new ADR)

## What was done

| Where | What |
|---|---|
| `editor/blueprint-checklist.ts` | the completeness checklist: RCS, antenna, power, parachutes, life support, heat shield, read from the modules of the card's parts; which of them the card's goal and crew expect (`expectedItems`) and which are missing (`gapsOf`) |
| `vab/BlueprintLibrary.svelte` | a Details toggle on each card: the verdict for the world's system (and a warning when the liftoff thrust-to-weight is under 1), the checklist with the gaps in the warning colour, the part labels (kinds and counts) and the locks; [the dialog](assets/312-library.jpg) and [a detail panel](assets/312-detail.jpg) |
| `vab/thumbnail-cache.ts`, controller | the card pictures kept in IndexedDB (`orbital-thumbs`), keyed by the blueprint, a hash of the design the card builds, the system and its variant (plan 380); read in the background and the card redraws when one arrives, drawn once from the Hangar's view otherwise |
| controller | a blueprint with parts the world's tech tree has not unlocked (`designLocks`) opens **read-only**: the card says "Open read-only" and lists the locks, every edit is refused with a note, a banner offers "Make an editable copy"; loading anything else lifts it |
| `BlueprintLibrary.svelte`, `launch/vessel-library.ts` | the tabs **My designs** and **Sub-assemblies**, built on the Launch page's library functions (`shownLibrary`: dedupe, variants, search, filter, sort) as the plan asked; Open for a design, Place for a sub-assembly |

## Decision recorded (the plan's "decide first")

The "My designs" tab reuses `launch/vessel-library.ts` rather than a second list: the controller turns its saved entries into `VesselItem`s (`savedItems`) and the dialog calls `shownLibrary`. Nothing of plan 346's or 350's was duplicated.

## Tests

`blueprint-checklist.test.ts` (capabilities, what a trip expects, the gaps), `thumbnail-cache.test.ts` (a blueprint in two systems gets two entries; a changed design draws again), `read-only.test.ts` (a locked blueprint opens read-only, edits are refused, an editable copy lifts it, an unlocked one loads as usual).

## Not done

- **Leader-line labels in the 3D view** (`Renderer.project`): the detail panel lists the labels, but no lines are drawn on the vessel in the Hangar. They need the view to hold the blueprint while the dialog is open.
- The trip planner's verdict is the system fit and the liftoff thrust-to-weight; the Δv-to-destination verdict of the Hangar's trip line is not repeated per card.
- The checklist's "expected" rules are a first reading of goal and crew (`expectedItems`); a blueprint may declare its own later.
