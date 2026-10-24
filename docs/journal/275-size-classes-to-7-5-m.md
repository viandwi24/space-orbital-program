# 275 — Size classes, part two: shaped tanks, the round 0.625 m tank, a separator and the size filter

**Plan:** [plans/275-size-classes-to-7-5-m.md](../plans/275-size-classes-to-7-5-m.md) · **Session:** Worker B, 2026-10-24 · **ADR:** 0347 (0256, 0212, 0317) · **API:** 0.1.124

## What was done

| Where | What |
|---|---|
| `renderer/parts/generators/tank-shapes.ts` | `tank-toroid` (a core tube and a closed torus ring with brackets), `tank-sphere` (a ball on two collars, a mounting ring with lugs), `tank-taper` (a cone between two collars, welds, a stripe): each with collars at the node radius so the seam test needs no exceptions |
| `mods/stock/parts/tanks.ts` | `liquidTank` takes a look (kind, params, paints, nodes); `stock.tank-0625` is a ball (same id); `stock.tank-toroid`, `-sphere`, `-adapter-3750-1875`, `-booster` (radial node), fuel by volume, dry mass by widest diameter (ADR 0317), eras in `realism.ts`, tech in `tech.ts` |
| `mods/stock/parts/structure.ts`, `modules.ts` | `stock.separator-1250/-2500/-3750`: a `ModuleDecoupler` with `consume` |
| `core`, `sim` | `detach(node, impulse, { consume })`; `processPending` removes a consumed part once the cut is done (`vessel:destroyed`, reason `spent`); API 0.1.124 |
| `web` | the size filter (`editor/size-class.ts`, the chips in `Catalogue.svelte`); a `spent` removal is no "Vessel lost" in the toast or the bell |
| tests | `sim/test/separator.test.ts` (no ring, two vessels, one `spent`; a decoupler leaves its ring), `size-classes-pad.test.ts` (a ~105 m 7.5 m tower on ten motors stands 5 s and lifts off), `web/editor/size-class.test.ts` (the filter keeps only the parts of the class, every class; adapters in two; the chips render), the stock id/boot/visual lists and the part-ids snapshot, the seam test (every new face at its node radius) |

## Screens

Catalogue thumbnails: [Pebble](assets/275-catalogue-pebble.jpg), [Doughnut](assets/275-catalogue-doughnut.jpg), [Bubble](assets/275-catalogue-bubble.jpg), [Chimney](assets/275-catalogue-chimney.jpg), [Spindle](assets/275-catalogue-spindle.jpg), [Clean Break](assets/275-catalogue-clean-break.jpg); the XXL filter: [275-catalogue-xxl.jpg](assets/275-catalogue-xxl.jpg). In the Hangar: [the stack](assets/275-hangar-stack.jpg) (a toroid on a ball on a tapered adapter tank) and each part as it was placed: [Pebble](assets/275-hangar-pebble.jpg), [Doughnut](assets/275-hangar-doughnut.jpg), [Bubble](assets/275-hangar-bubble.jpg), [Chimney](assets/275-hangar-chimney.jpg), [Spindle](assets/275-hangar-spindle.jpg), [Clean Break](assets/275-hangar-clean-break.jpg). `apps/web/scripts/capture-275.ts` takes them. "Before" for the 0.625 m tank is the barrel of plan 289 (the same generator as the 1.875 m barrels, no screen kept of it); the other parts are new.

## Decisions

- Fuel from volume, dry mass from the widest diameter: the same measure `realism.test.ts` uses, so the new parts pass it unchanged.
- The separator is a flag on the existing decoupler and one more step in `processPending`, not a new module: the two share staging, the staging switch and the action, and a mod can set `consume` on its own decoupler.
- The shaped tanks' collider stays a cylinder (ADR 0347 point 1).

## Open

The panelled large tanks (TNK-04), radial tanks (TNK-06), a ring tank beyond 1.25 m, separators for 5 and 7.5 m, and the owner's look at the shapes in the Hangar and in flight. Frame time was not measured (the parts are a few thousand triangles).
