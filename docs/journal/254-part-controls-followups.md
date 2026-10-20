# 254 — Part controls, the rest

**Plan:** [plans/254-part-controls-followups.md](../plans/254-part-controls-followups.md) · **Session:** Worker C, 2026-10-20 · **ADRs:** none

## What was done

| Where | What |
|---|---|
| `inspector/crew-seats.ts`, `PartInspector.svelte`, flight page | a Crew section in the inspector of a part with seats: "Crew 2 / 3", each member with a "Move to…" picker of the other seats with room; picking sends `crew-transfer`. `crewSeats` is pure and tested (full seats, free seats, a part without seats) |

## What the plan's other items turned out to be

- **Set as target on a docking port:** nothing to add. The Target panel lists every other vessel's ports as targets (plan 222), and a part action on the player's own port has nothing to target.
- **RCS navball mark:** the HUD already has the RCS switch beside SAS.
- **Take (EVA), a wheel motor, a pod SAS level:** each needs a new sim feature (a walk-to-part and a sample handover; a drive force; a rule for SAS levels): plan 260.
