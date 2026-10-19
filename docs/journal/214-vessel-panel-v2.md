# 214 — Vessel panel v2 and the part inspector

**Plan:** [plans/214-vessel-panel-v2.md](../plans/214-vessel-panel-v2.md) · **Session:** Worker B, 2026-10-19 · **ADRs:** [0205](../decisions/0205-vessel-panel-v2-part-inspector-hud-layout.md) points 1–4, 0153, 0174, 0220 · **Research:** 03 §1–2, 05 §3.2–3.4

## What was done

| Where | What |
|---|---|
| core | `PartActionDescriptor.units` (other units, `amount = value × factor`) and `more`; schema and type |
| renderer | `partAt(x, y)`: one raycast against the flown vessel's part meshes |
| stock | engine readouts (status, thrust, Isp) and limiter units (% and kN), gimbal limit under More; heat shield ablator readout; control surface authority and `setAxis:<axis>` switches |
| web | `ControlRows.svelte` (descriptors as rows, shared); `lib/inspector/` (`PartInspector.svelte`, `inspector-model.ts` pins, `units.ts` typed values); `VesselPanel` v2 (Overview counts, Parts search and stage filter with Inspect, Resources with lock and transfer picker); the flight page's resize grip (300–440 px, `settings.interface.panelWidth`), inspector column, click to inspect, two-way highlight; the side column stops above the crew panel, which takes half the height at most |
| tests | vitest `inspector-model`, `vessel-model` (counts, stage filter); stock `modules.test`; renderer `partAt`; e2e `vessel-panel` (width, resize, click, "50 kN"), `resources-tab` |

## What surprised me

- **The vessel panel spilled under the crew panel** once its Resources tab was tall: the crew panel grows with its broadcast offers after the first measure, the panel inherited `display: flex` from `.tr` (so its content overflowed instead of scrolling), and `.tr`'s own max-height won over `.vr`'s at equal specificity. A ResizeObserver, `display: block` and `.tr.vr` fixed it; the e2e's click on Transfer found it.
- **Units as descriptor data** made the inspector generic: `50 kN` works because the engine says its limiter reads in `kN` with a factor of its thrust.

## Decisions made (link ADRs)

- No new ADR; the choices are in the plan's Log (grip on the left edge, what is left of the §7.6b P0 column).

## Open questions / follow-ups

- §7.6b items not done here: pod rename and vessel type (plan 223), the reaction wheel's mode, the inspector's crew list with EVA and transfer, the decoupler's "staged" switch.
- On narrow screens the inspectors stand beside the drawer rather than as tabs inside it.
- Plan 218 reuses `PartInspector` in the Hangar.

## Verification output

```
(filled in at handover)
```
