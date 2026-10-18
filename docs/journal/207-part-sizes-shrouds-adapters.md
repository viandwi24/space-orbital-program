# 207 — Part size classes, seam tests, auto shrouds, adapters and cones

**Plan:** plans/207-part-sizes-shrouds-adapters.md · **Session(s):** Worker A (release roadmap) · **Date:** 2026-10-19

## What was done

- **Step 1, the split (own commit, pushed first):** `mods/stock/src/parts.ts` became `mods/stock/src/parts/<family>.ts`: `aero`, `command`, `comms`, `engines`, `ground`, `life-support`, `power`, `recovery`, `science`, `structure`, `tanks`, plus `shared.ts` (`RADIUS`, `stackNodes`, `cylinder`, `BOOSTER_RADIUS`) and `index.ts`. `mods/stock/src/index.ts` registers the parts in the same order as before. `test/part-ids.test.ts` snapshots every part's id, mass, cost and modules with their configs; the snapshot was written before the split and passed unchanged after it.
- **Step 2:** the BST-1 top ring now walks bottom to top. The seam test found two more inverted surfaces, both fixed:
  - the booster bell's inside walked up, so it faced away from the axis; it now walks down, like the LV-T30's;
  - the tank generator's roll stripe on a 0.4 m part ran top to bottom (the band's bottom was clamped above its top). Such a part now draws only the accent line; the inverted band was culled and invisible anyway, so the look is unchanged.
- **Step 3:** `attach.<node>.size` in the part schema, with `NODE_SIZES`, `nodeSize`, `nodeSizeClass` and `nodeSizesMatch` in core and the SDK; API 0.1.75. `stackNodes(height, size = 1.25, bottomSize)` gives every stock stack node a size. The pod's top (docking collar) is 0.625 m; the BST-1 and its nose cone are 0.8 m (ADR 0212).
- **Step 4:** `packages/renderer/test/part-seams.test.ts`. It records every profile that every stock generator revolves, at high and low detail, and checks the winding with `profileDirection`. It also checks that the rim of every sized face is at the node radius within 1 mm. Two generator changes made the rims match: the pod's collar is 0.3125 m in radius, and its retaining ring sits 4.5 cm above the bottom face instead of 7 cm.
- **Step 5:** `parts/shroud.ts`. A generator declares `GeneratedPart.shroud`: the engines from the plate to the bottom face, the decoupler only onto a wider part. `shroudsBelow` finds the part on a model's bottom node from where the nodes meet, in a shared frame. The flight scene runs it when a vessel's part set changes; the Hangar's part layer runs it per group on every sync. A shroud is one revolve (inside down, lip, outside up) with geometry shared per part, detail and size.
- **Step 6:** `adapter` and `tail-cone` generators; `stock.adapter-small` (0.625–1.25 m), `stock.adapter-large` (1.25–2.5 m), and nose and tail cones at 0.625, 1.25 and 2.5 m. They sit in the Structures tech node for now; plan 231 places the release parts.
- **Step 7:** the `size-mismatch` check in `apps/web/src/lib/editor/checks.ts` (`sizeMismatches`, caution level). The pre-flight list shows it with an icon (`data-testid="size-mismatch-mark"`) beside the text. The e2e imports a design file through the vessel library.

## What surprised me

- No stock face had its outermost ring on the face plane: every collar has a 2–3 cm chamfer. ADR 0212 measures the rim within a 5 cm band of the face, so the chamfers stay.
- The BST-1 is 0.8 m, none of the three classes. A node size is therefore any diameter, and the classes are the stock convention (ADR 0212). Plan 210 resizes the booster.
- The AC names `e2e/editor.e2e.ts`, which is the script editor's file; the Hangar test was added there as written, and its header says so.
- A fresh worktree has no `apps/web/static/sandbox/*.js`, so the web typecheck fails until `bun run build:sandbox` has run once.

## Decisions made (link ADRs)

- ADR 0212: node size is a joint diameter; the default for older parts; the 5 cm seam band; the faces that are not flat joints (engine bottoms, which the shroud covers, the heat shield's dish and the flotation collar); the pod's top at 0.625 m.

## Open questions / follow-ups

- The mismatch mark lives in the pre-flight list. A marker drawn at the joint in the 3D view would be nicer; that belongs to the Hangar inspector (plan 218).
- One-click adapter insertion is P1 (rancangan §8b.6). The visual seam screenshots are P1 (§8b.9).

## Verification output

See the plan's Log for the commands and their results.
