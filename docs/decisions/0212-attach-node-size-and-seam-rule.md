# 0212 — Attach-node size is a joint diameter; the seam rule and its band

**Status:** accepted
**Date:** 2026-10-19
**Plan:** plans/207-part-sizes-shrouds-adapters.md
**Builds on:** ADR 0203 point 1 (explicit node sizes, seam tests, shrouds, adapters), ADR 0034 (radial attachment)

## Context

ADR 0203 asks for explicit node sizes of 0.625, 1.25 and 2.5 m and a test that every joint rim equals its node radius within 1 mm. Measuring the stock generators showed three things the ADR does not settle:
- the BST-1 booster and the nose cone that caps it are 0.8 m across, which is none of the three classes, and plan 210 resizes the booster later;
- every collar has a small chamfer, so the outermost ring sits 2–3 cm inside the face, not on it;
- some stack faces are not flat joints: an engine's bell, the heat shield's dish and the flotation collar, a ring wider than the stack.

## Decision

1. **`size` is the joint diameter in metres**, a positive number on an attach node (`attach.<node>.size`), optional in the schema. The stock classes are `NODE_SIZES = [0.625, 1.25, 2.5]`. A mod may use another diameter; the BST-1 line keeps 0.8 m until plan 210.
2. **Default for older parts:** a stack node (pointing along ±Y) of a cylinder part without a `size` takes the class nearest the part's diameter (`nodeSize`). Radial and connector nodes, and box parts' nodes, have no size and fit anything.
3. **Match rule:** two joined nodes fit when both sizes are within 1 mm, or either has none (`nodeSizesMatch`).
4. **Seam rule:** the rim of a face is the largest radius of the part's visible static geometry within **5 cm** of the face, inside the part. It must equal `size / 2` within 1 mm. The 5 cm band admits the collar chamfer.
5. **Not flat joints:** the test lists them with a reason. An engine's bottom joint is carried by its auto shroud, which the shroud test checks instead.
6. **Winding rule:** every revolved profile walks bottom to top; an inner nozzle surface walks top down (`profileDirection`).
7. The Command Pod's top node is 0.625 m (its docking collar), its bottom 1.25 m.

## Alternatives considered

- **A strict union of the three classes in the schema** — rejected: the stock booster is 0.8 m, and third-party mods would be locked out of other diameters.
- **Rim exactly at the face plane** — rejected: it would remove every collar chamfer in the stock look for no gain at a joint.
- **Resize the BST-1 now** — rejected: plan 210 owns the booster's rework into an SRB with sizes.

## Consequences

- API_VERSION 0.1.75 (additive).
- The Hangar check marks a joint whose sizes differ, with text and an icon.
- New parts declare `size` on each stack node; the seam test fails for a generator whose rim misses the node radius.
