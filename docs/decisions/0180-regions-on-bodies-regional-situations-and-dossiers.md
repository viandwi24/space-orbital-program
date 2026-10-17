# 0180 — Regions on bodies, regional situations and dossiers

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 104
**Builds on:** ADR 0099 points 1, 3 and 6 (the matrix with regions, dossiers, presets), 0178 (situations, subjects, the value curve), 0142 (terrain seed and sites), 0067 (terrain kinds per body).

## Context

ADR 0178 left every subject's region as `global`. ADR 0099 wants regions as data, and dossiers per body that results fill. Open: how a body declares regions (the home body's must agree with its drawn ground), which situations depend on the region, how regions weigh in the value, what a dossier holds, what unlocks an entry, and whether dossiers are saved.

## Decision

1. **Region kinds** in `defineBody({ regions })`:
   - `{ kind: 'biomes', regions?: [{ id, label?, multiplier? }] }`: the biome classes (`classifyBiome` of `sampleMap`) of the canonical planet map of the world's terrain seed and sites, the map the ground is drawn and the terrain is read from. Only for a `hills` body. `regions` overrides labels and multipliers by biome id.
   - `{ kind: 'cells', seed, cells?, regions: [{ id, label, multiplier? }] }`: `cells` points (default 4 per region) from the seed, spread on the sphere, the k-th belonging to region `k mod n`. The region of a direction is that of the nearest point.
   - `{ kind: 'bands', bands: [{ id, label, from, to, multiplier? }] }`: latitude bands in rad. The first band that holds the latitude wins, and none gives `global`.

   A body without `regions` has the one region `global`. `regionAt(body, direction, world?)` takes a body-fixed unit direction. `regionsOf(body)` lists the ids and labels.
2. **Stock.** The home body is `biomes`: ocean, beach, grass, forest, desert, rock, snow. Desert, rock and snow are worth ×1.5, the rest ×1. The moon is `cells` with seed 7: highlands ×1, maria ×1.2, crater fields ×1.5.
3. **Regional situations.** `defineSituation` takes `regional?: boolean` (default false). Stock `landed`, `splashed`, `flying-low`, `flying-high` and `space-low` are regional, and `space-high` is global. A result's region is the region under the vessel (its body-fixed direction at the time of the result) when its situation is regional, else `global`. The value curve of ADR 0178 point 4 uses `body multiplier × region multiplier`. `VesselSnapshot.science.region` shows the region under the vessel.
4. **Dossier entries** are data: `defineDossierEntry({ id, label, order, fact, unlock })`. `fact` is one of `atmosphere`, `gravity`, `surface`, `regions` or `resources`. `unlock` is `{ situations?, experiments? }`, and an empty `unlock` means any result on the body. An entry is unlocked once a subject on the body with at least one result matches both lists (when given).
5. **Facts** come from the body definition and the subjects: atmosphere (height, surface pressure, scale height, or none); gravity (surface gravity, μ, radius); surface (terrain kind, day length); regions found (the regions of the body's subjects, with labels, out of how many); resources (a hint text until resources exist). `dossierOf(body, subjects, entries)` in core is pure.
6. **No new save data.** A dossier is derived from `SimSave.science`, which is saved already. Saves from 103 load unchanged: their subjects are `global`.
7. **Stock entries:**
   - atmosphere profile: unlocked by flying low or high, or space low;
   - gravity: space low or high;
   - surface: landed or splashed;
   - regions found: any result;
   - resource hints: a surface sample.
8. **UI.** The Target panel shows a body card when the target is a body: the unlocked entries with their facts, and each locked entry with what unlocks it. The region overlay on the map is plan 192.

## Alternatives considered

- **A region texture per body, shipped as an asset:** rejected. The home body's regions must be the drawn biomes, which already come from a seeded map. Assets would break ADR 0025, which generates the world from code.
- **Saving dossiers:** rejected. They would duplicate what the subjects already say, and could disagree with them.
- **Every situation regional:** rejected. High space over a body is one place, as in the game that inspired the matrix.

## Consequences

- **Mod API:** body `regions`, situation `regional`, `defineDossierEntry`, `regionAt`, `regionsOf`, `dossierOf`; additive, `API_VERSION` patch bump. Load-report kind `dossier-entry`.
- **Protocol:** `VesselSnapshot.science.region`. **Save:** unchanged.
- **Follow-ups:** 192 (map overlay), 105 (tech tree), resource data with the hints entry.
