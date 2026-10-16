---
id: 029
title: "UI: VAB follow-ups (vessel library, sub-assemblies, hangar polish, device tuning)"
status: draft
owner: ""
depends: [022]
phase: 3
created: 2026-10-16
updated: 2026-10-16
---

# 029 — UI: VAB follow-ups

## Goal

The VAB of plan 022 stops falling short where its journal names it: only one design lives in the browser at a time, there is no way to keep a sub-assembly, the hangar is dark and sparse at the edges, and nothing was measured below an Apple M5.

## Context

- Read: `docs/journal/022-vab-3d.md` (self-review, "Not done"), ADR 0029, `docs/product/visual-direction.md`.

## Scope

**In (candidates, to be ordered at refinement):**
1. **Vessel library**: several named designs in `localStorage` or IndexedDB (list, open, duplicate, delete, thumbnails from the 3D view), instead of the one draft plus JSON file; an "Open" dialog replacing the file-picker button.
2. **Sub-assemblies**: save a selected subtree as a reusable assembly and place it from the catalogue (the editor already has loose assemblies and `attachTargets` for them).
3. **Radial attach and symmetry** once plan 026 gives the design format surface nodes (`attachTargets` is where they plug in), plus the 3D handles to rotate and mirror.
4. **Hangar polish**: lettering over the bay door is hard to see from the default camera, walls are uniform dark cladding, no moving props (crane never moves, no vehicles, no workers), dust is the only motion; a time-of-day or lighting variant per graphics preset.
5. **Catalogue**: part categories come from module ids (`categoryOf`); a mod-supplied category and sort order on the part definition would let third-party parts group properly (needs an SDK change and an ADR); stage chips show glyphs, not rendered thumbnails.
6. **Trip planner**: more targets than "low orbit" (the Mun-like moon, escape), per-body gravity and atmosphere losses from a quick simulation instead of the 1.3 km/s allowance.
7. **Device tuning**: frame time on Apple M1/M2 and a mid-range integrated GPU; the `low` quality path (no post chain, no shadows, no dust) is wired but only measured on an M5.
8. **Accessibility pass**: a screen-reader description of the stack ("pod, wheel, tank, engine ..."), a test of the reduced-motion path in the browser, a high-contrast marker option.

**Out:** new part types, flight changes.

## Steps

1. Refine (order the candidates, measure the device gaps).

## Acceptance criteria

- [ ] To be made measurable at refinement.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, ADR if the SDK or the format changes.

## Log

- 2026-10-16 — Created as draft from the plan 022 self-review.
