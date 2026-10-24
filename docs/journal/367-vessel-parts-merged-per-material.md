# 367 — Vessel parts merged per material

**Plan:** [plans/367-vessel-parts-merged-per-material.md](../plans/367-vessel-parts-merged-per-material.md) · **Session:** Worker A, 2026-10-24 · **ADR:** [0352](../decisions/0352-vessel-parts-merged-per-material.md)

## What was done

`parts/vessel-batch.ts` (the merge, the signature), `PartModel.cloned`, `SceneModel` (a batch per vessel entry, synced after the parts, disposed with the entry), `test/vessel-batch.test.ts` (merge to one mesh per material, hide and restore, rebuild on a join, a move, a glow and a replaced model, indexed and non-indexed geometry).

## Findings

- The first build merged nothing: the parts' geometries are **non-indexed** with groups in vertex units, and the batch only handled indexed ones. The counters showed identical draw calls before and after, which is how it was found; the fix copies the group's vertex range.

## Draw calls (M5, WebGPU, the booster, two runs of each build; `m5-batch-*.json`)

| | before | after |
|---|---|---|
| high, pad | 275, 273 | 108, 111 |
| medium, pad | 273, 273 | 121, 121 |
| low, pad | 117 | 57 |
| high, 3 km | 233, 235 | 69, 64 |
| medium, 3 km | 226, 226 | 76, 74 |
| low, 3 km | 90 | 30 |

Medium falls by 56 % at the pad and 67 % at 3 km (acceptance: at least half). Triangles are unchanged. Frame intervals are within the noise of the run (load 4 to 8): p95 at `medium` 15.4 to 25.5 ms across builds and repeats, at `high` 18 to 50.

## Screens

`docs/journal/assets/367-{before,after}-{off,on,turn,after}.jpg` (1512 × 945 at DSF 2, `high`, the booster at 1.7 km): the vessel's paint, panels and shading are the same.

## Not done

`measure-sunrise.ts` with `STEP_TO` (no pipeline is new: the merged meshes use the parts' own materials), `capture-graphics.ts` and `/dev/parts` screenshots, a measurement with many vessels in view, a timing of the rebuild on a large vessel.
