# 0257 — Stock parts stay procedural, built from a shared detail kit, with liveries; every part kind gets its own generator

**Status:** accepted (CTO call delegated by the owner, 2026-10-21)
**Date:** 2026-10-21
**Plan:** plans/291-part-detail-kit-livery-and-icons.md
**Builds on:** ADR 0028 (visual descriptor, providers), 0076 (mods may ship glTF), 0212 (seams)

## Context

Research (`refs/part-visuals-and-blueprints/README.md`) found that 23 of 76 stock parts are drawn by the `tank` generator: solar panels, antennas, the probe core, RTG, batteries, all seven science parts, life support, the data drive, monoprop tanks and the flotation collar. That is why the owner sees "discs, rings and tubes". Engines share one generator with few parameters; there are no liveries; small parts are dots in the catalogue icons. KSP's revamped parts read through silhouette, two or three levels of detail (shape, rims and stubs, panel lines and bolts), at least two materials and visible hollows.

## Decision

1. **Stock stays procedural.** No binary art in the repo, licence-clean, palette tinting, detail levels, instancing and deploy animation already work. glTF stays the mod path (ADR 0076).
2. **A shared detail kit** (`packages/renderer/src/parts/generators/kit.ts`) that every generator uses: `rim`, `band`, `raisedRing`, `panelInsets`, `bolts` (instanced), `stubPipe`, `ribbedBell` (inner and outer wall), `hazardStripe`, `hatch`, `foilPanel`, `lensLamp`, `hinge`, `cellGrid` (solar cells), `louvres`. Plus a `bronze` material slot.
3. **`visual.params.livery`** (additive): `plain`, `bands`, `checker`, `half-black`, `foam`, `steel`, read by tanks, SRBs, boosters, fairings and nose cones. Blueprints pick a livery per stage.
4. **One generator per part kind.** No functional part may use `tank`. The generator list grows by: probe, antenna-whip, antenna-dish, solar-fixed, solar-fold, solar-array, battery, rtg, fuel-cell, instrument (with a `kind` param per experiment), container (life support, data), toroid tank, sphere tank, service bay, robotics parts, rover parts. The tracker IDs say which.
5. **Icons:** the catalogue icon frames only visible meshes (no hidden plume or canopy), views from the side and a little above, and does not paint attach faces blue in icons. Connectors show a sample bar.
6. **Budget:** extra triangles go behind `detail.extras` (0 on `low`), repeated small things (bolts, cells, louvres) are instanced; the pad frame of the booster rocket on `high` may grow by at most 0.5 ms on the M5.

## Alternatives considered

- **Hand-made glTF for stock.** Best look per hour of an artist; we have no artist, binary art needs a licence trail, and deploy animation for models is weaker than for generators.
- **Keep generators, add only textures.** Would not fix silhouettes, which is the main complaint.

## Consequences

- Plans 291 (kit, liveries, icons) → 276–281 (one family each) use the kit.
- Seam tests (ADR 0212) cover every new generator.
