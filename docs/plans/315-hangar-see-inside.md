---
id: 315
title: "Hangar: see inside fairings, bays and petals (hover tip, x-ray, open, Show payload)"
status: done
owner: "part visuals session (Claude)"
depends: [303, 314]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 315 — Seeing inside in the Hangar

## Goal

The owner: "I don't know what is inside without a way to look." Hovering a part shows its name, mass and, for a shell, what it holds. A shell under the pointer turns see-through. A part opens in the editor. "Show payload" turns every shell see-through. Parts inside stay selectable.

## Context

- Plan 302 (bays: `stock.bay` `shell`), plan 219 (fairings), plan 303 (petals, cargo bay, telescope).

## Scope

**In:**
- `lib/editor/inside.ts`: shells and their contents, from each shell's closed profile in its own frame (as the sim does for drag); `openModules`; `seeThroughOf`;
- `VabPart.modules`, `seeThrough` and `holds` in the renderer: an x-ray draw, and picks that reach through a shell to what it holds only;
- the controller's hover, open and show-payload state; the tip; an Open/Close button on the selection card; the Show payload button.

**Out:** opening in flight (the parts' own actions do that).

## Acceptance criteria

- [x] `inside.test.ts`: Kronos V's petals hold the Selene lander, and not the pod or the stage below; Wayfarer's cargo bay holds the satellite; the see-through rules; what opens.
- [x] Browser (Kronos V):
  - hovering the petals ghosts them and lists eight parts and "3 more";
  - Show payload ghosts them;
  - a click on the ghosted petals selects the petals, not the decoupler behind;
  - Open swings the petals out.

## Docs checklist

- [x] `docs/STATUS.md`, journal `315-hangar-see-inside.md`.

## Log

- 2026-10-21 — Done on the owner's request, relayed by the parent session.
