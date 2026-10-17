# 083 — Data items: sized data stored on vessels

**Plan:** plans/083-data-items-on-vessels.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-17), three-agent team mode · **ADRs:** [0172](../decisions/0172-data-items-shape-ids-value-curve-and-storage.md) (new), [0099](../decisions/0099-science-matrix-data-samples-dossiers-and-tech-tree.md), [0101](../decisions/0101-communications-one-model-six-tiers-delay-off-by-default.md) · **Research:** none

**Status when written: criteria met here, handed over as `ready/083`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/data.ts` (new) | `DataItem`, `NewDataItem`, `DataKindDefinition`, schemas, `dataValueFactor`, `dataValueAt`, `DataStorage`, `DataStorageState` |
| `packages/core` | registry `dataKinds` (kind `data-kind`), `ctx.dataKinds`, `ModuleDefinition.dataStorage`, `VesselApi.data`, events `data:stored` / `data:dropped`, commands `move-data` / `delete-data`, `VesselSnapshot.data`; `API_VERSION` 0.1.31 (095 took 0.1.30) |
| `packages/sim/src/data.ts` (new) | `storagesOf`, `dataUse`, `storeData`, `moveData`, `deleteData`; wired into `hooks.ts` (`ctx.vessel.data`), `commands.ts`, `snapshot.ts` |
| `mods/stock` | five data kinds, `stock.data-storage`, part `stock.data-drive` (64 Mbit, 0.4 m; catalogue "Other", as stock places no part explicitly) |
| tests | `packages/sim/test/data.test.ts` (5), `packages/core/test/data.test.ts` (2), stock boot test ids and kinds |
| docs | ADR 0172, `simulation.md` "Data items", `plugin-system.md`, guide section "Data items" |

## Decisions

- **Items live in module state**, so save, resume and staging needed no new code and the save format did not change. The resume test is byte-exact for both the save and the snapshot after 10 s.
- **A new stock part** instead of adding storage to the command pod. Adding a module to an existing part would have changed the frozen save fixtures and every saved design's module list.
- **Item ids** come from the storing module's counter (`<part entity>:<n>`). No sim-level counter is needed, and the PRNG is not touched.
- **Full storage drops the incoming item.** Eviction by priority is left to the queues of 119.

## What surprised me

- The `tank` generator is at least 0.36 m tall: a 0.2 m drive failed the renderer's "model fits its physics cylinder" test, so the drive is 0.4 m. Stock also places no part in the catalogue explicitly (a web test checks it), so the drive has no `catalog` entry and lands in "Other".
- `definePart` with module ids as strings needs the `ModuleMap` augmentation for type checking. The sim test registers its fixture parts as plain data instead.

## Follow-ups

- 103 (science) stores through `ctx.vessel.data.store`; 119 (comms tier 4) reads `storagesOf` order and the kinds' `priority`.
- The vessel panel (111) and the Comms tab (115) show `VesselSnapshot.data` and the storage module's item list.

## Verification output

```text
bun test packages/sim/test/data.test.ts packages/core/test/data.test.ts mods/stock/test/boot.test.ts   all pass
bun test packages/renderer/test/parts.test.ts                                                         pass (drive 0.4 m)
bun run docs:check                                                                                    docs-check: OK
bun run test                                                                                          1372 pass, 0 fail (165 s)
bun run typecheck                                                                                     exit 0 (56 s)
bun run build                                                                                         exit 0
bun run --filter @orbital/web test        874 passed, 1 skipped; editor-options and settings fail at import here only (no Node)
```
