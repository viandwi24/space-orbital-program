# 0259 — Functional parts mount on surfaces; their stack versions stay as hidden legacy parts

**Status:** accepted (CTO call delegated by the owner, 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/280-power-comms-science-life-support.md
**Builds on:** ADR 0235 (surface links), 0257 (one generator per kind)

## Context

Solar panels, antennas, science instruments, the RTG, the data drive and life-support parts are 1.25 m stack cylinders (`stackNodes`). That forces their shape and is not how KSP or real spacecraft carry them: they sit on the hull. Changing an existing part's nodes would break saved designs and flights that stack them.

## Decision

1. **New surface-mount parts** with a single mounting face (`radial` node or a bottom node used by a surface link), shaped for the job:
   - flat solar panel;
   - folding solar array;
   - tracking array;
   - whip antenna;
   - folding dish;
   - large dish;
   - radial battery;
   - RTG;
   - fuel cell;
   - each science instrument;
   - container boxes.

   Stack versions remain only where they make sense: stack battery discs, the probe cores, a stack solar "wing pair" (Soyuz style), the relay dish and the toroid tanks.
2. **Old ids stay as legacy parts:** still resolve, still fly, still drawn by their new generator where the shape allows, but hidden from the catalogue (`catalog.hidden: true`, additive). No migration of saved designs or saves is needed. A Hangar notice offers "replace with the new part" when it can do so without moving children.
3. **Deploy and staging:**
   - Deployable parts get `visual.deploy` animations: panels unfold, dishes open like umbrellas, whips extend, bay doors open.
   - They can be added to the staging stack (`stageable`, off by default).
   - Panels and dishes break above a dynamic pressure while deployed (KSP behaviour), with the threshold per part.

## Alternatives considered

- **Change the existing parts' nodes and migrate.** Children attached on top of a stacked panel would have nowhere to go; a migration that guesses is worse than keeping the old part.
- **Allow both stack and surface on the same part.** Shapes would still be compromises.

## Consequences

- The catalogue grows; the old ones disappear from it.
- Blueprints use only the new parts.
