# 0350 — Engine looks, verniers, small motors and the Abort group of Kronos V

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/276-engines-plates-srbs-and-escape-tower.md
**Builds on:** ADR 0257 (generators), ADR 0233 (Abort is custom slot 0), ADR 0316 (stock owns the blueprints), ADR 0317 (realistic stats), ADR 0347

## Decision

1. **Looks are params of the existing generator.** `engine.ts` takes `style`: 1 an open frame (four rails and two hoops round the chamber), 2 a full shroud (a cowl over chamber and pumps), 3 a vacuum bell (a dark radiation-cooled extension). Stock sets 1 on the LV-T30, 3 on the LV-909, 2 on the RE-I5; mods may set the same param. `booster.ts` takes `joints`: that many field joints (a dark clevis ring with a bolt circle) in place of the thin welds, 3 on the BST-1 and BST-3, 1 on the BST-0, 2 on the liquid booster. The shapes stay inside the part's cylinder; the seam rule is unchanged.
2. **Verniers are drawn, not simulated.** `engine-cluster` takes `verniers` (0 to 4): small bells on the rim between the main ones that swing with the engine. `stock.engine-vernier` ("Quartet", the RD-107 of 1957: four chambers and two verniers, 450 kN, 306/255 s, kerolox-early) has the same four plumes as the KR-4 and a wider gimbal (6°) that does the verniers' work. A vernier with its own thrust and plume is not built: the sim has no roll authority to give it that the gimbal does not.
3. **Two small generators.** `engine-mini` (a plate, a short chamber and a wide bell, scaled to the part's radius, since `engine.ts` has the 1.25 m class's sizes in it) draws `stock.engine-tiny` ("Spark", 0.625 m, 20 kN, hypergolic-early, tier 2 with the vacuum engine). `separatron` draws `stock.separatron` ("Nudge": 6 kg, 18 kN for about 5 s of 45 kg of solid fuel, a radial part, staged with the decoupler). It is not angled: a tilt would need the radial node to carry a rotation; it pushes along the stage's axis, and symmetric copies cancel as boosters do.
4. **The Abort group** of both Kronos V designs (half scale and Sol 1:1) holds the tower's motor (`stock.engine` `setActive`) and the capsule's separation from the service module (the wide decoupler under the heat shield, `decouple`). The tower stays on the cover and pulls the capsule with it; the cover's own joint is a staging step for later, once the capsule is clear. The design builder gets `Build.group(slot, part, module, action)`; the baked blueprints carry `groups`. A headless test fires the group on a coasting capsule stack: the capsule is more than 500 m from the stack ten seconds later.
5. No new API: all of it is data and generator params.

## Left open

The angled separatron; verniers with their own plumes; the nuclear, ion and aerospike engines (tracker ENG-08…10); the Hangar placement screens (the catalogue thumbnails are in the journal); the owner's look at the engines.
