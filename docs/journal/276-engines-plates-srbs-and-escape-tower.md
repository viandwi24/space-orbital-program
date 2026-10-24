# 276 — Engines and boosters, the rest

**Plan:** [plans/276-engines-plates-srbs-and-escape-tower.md](../plans/276-engines-plates-srbs-and-escape-tower.md) · **Session:** Worker B, 2026-10-24 · **ADR:** 0350 (0257, 0233, 0316, 0317)

## What was done

| Where | What |
|---|---|
| `renderer/parts/generators/engine.ts` | `style` 1 open frame, 2 full shroud, 3 vacuum bell with a dark extension; stock: LV-T30 open, RE-I5 shrouded, LV-909 vacuum |
| `booster.ts` | `joints`: segmented casing with field-joint rings and bolt circles (BST-0/1/3, the liquid booster) |
| `engine-cluster.ts`, `small-motors.ts` | `verniers`; `engine-mini`; `separatron`; registered in `generators/index.ts` |
| `mods/stock` | `stock.engine-vernier` "Quartet", `stock.engine-tiny` "Spark", `stock.separatron` "Nudge" (realism kinds, tech: Propulsion and Orbital engines), snapshot and id lists |
| `apps/web/editor/missions.ts`, baked blueprints | `Build.group`; Kronos V's Abort group (tower motor, capsule separation); rebaked |
| tests | `sim/test/abort.test.ts` (Abort on a coasting capsule stack: more than 500 m apart after 10 s), `web/editor/missions.test.ts` (the group is in both Kronos designs), seam exceptions for the two new bells, stock lists |

## Screens

Catalogue thumbnails of every engine and booster of the plan (the remodelled LV-T30, LV-909, RE-I5, the BST-0, BST-1, BST-3 and LB-1, the new Quartet, Spark and Nudge): `assets/276-catalogue-*.jpg` ([lv](assets/276-catalogue-lv.jpg), [vacuum](assets/276-catalogue-vacuum.jpg), [wide](assets/276-catalogue-wide.jpg), [quartet](assets/276-catalogue-quartet.jpg), [spark](assets/276-catalogue-spark.jpg), [nudge](assets/276-catalogue-nudge.jpg), [bst-0](assets/276-catalogue-bst-0.jpg), [bst-1](assets/276-catalogue-bst-1.jpg), [srb-large](assets/276-catalogue-srb-large.jpg), [liquid booster](assets/276-catalogue-liquid-booster.jpg)). `apps/web/scripts/capture-276.ts` takes them. The Hangar placement shots did not work (the ghost followed the pointer; a placement needs the open ring), so there are none; "before" is the earlier generator output, not kept.

## Open

The angled separatron, verniers with their own plumes, ENG-08…10, the Hangar screens and the owner's look.
