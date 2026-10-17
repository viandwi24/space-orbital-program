# 103 — Science core: experiments, situations, subjects, data and samples

**Plan:** plans/103-science-core-experiments-data-samples.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-17), three-agent team mode · **ADRs:** [0178](../decisions/0178-science-situations-subjects-value-curve-states-credit.md) (new), [0099](../decisions/0099-science-matrix-data-samples-dossiers-and-tech-tree.md), [0172](../decisions/0172-data-items-shape-ids-value-curve-and-storage.md), [0113](../decisions/0113-economy-core-ledger-costs-charges-recovery.md) · **Research:** none

**Status when written: criteria met here, handed over as `ready/103`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/science.ts` (new) | `SituationView`, `SituationDefinition`, `ExperimentDefinition`, schemas, `bodyScience`, `situationOf`, `sortSituations`, `subjectId`, `ScienceSubject`, `subjectCap`, `nextValue`, `SaveScience`, `SCIENCE_RULES` |
| `packages/core` | body `science`; registries `situations` and `experiments`, `ctx` registrars, report kinds; `VesselApi.situation()` and `science.result/credit`; module hook `onRecover`; `ModuleInfo.experiment`; command `transmit-data`; events `science:result`, `science:credited`; `Snapshot.science`, `VesselSnapshot.science`; optional `SimSave.science`; `API_VERSION` 0.1.40 (092 took 0.1.39) |
| `packages/sim/src/science.ts` (new) | situation view and cache, results and subjects, credit to the ledger, `transmit-data`, recovery credit and `onRecover`, snapshots, save |
| `mods/stock` | six situations, five experiments, `stock.experiment` (READY / RUNNING / PAUSED / INVALID, `run`), five instrument parts, home and moon thresholds |
| `packages/scripting`, `apps/web` | `ship.science`, `runExperiment(partOrId)`; script API table and member test |
| tests | `packages/core/test/science.test.ts`, `packages/sim/test/science.test.ts` (9), `packages/scripting/test/science.test.ts` (1); stock boot, sandbox and member lists updated |
| docs | ADR 0178, `simulation.md`, `plugin-system.md`, guides "Science" (mods) and scripting |

## Decisions and deviations

- **Situation ids are `stock.landed` and so on**, not plain `landed` as the ADR first said. Every registry id must be `<plugin>.<name>`. The ADR is corrected.
- **Splashed needs real terrain below sea level.** Without a terrain field the reference sphere is the ground, and calling it sea would make every test landing a splashdown. The ADR says so.
- **The snapshot classifies fresh, without the cache.** Otherwise whether the UI asked would change what modules see during the 1 s cache window, and determinism would depend on the host.
- **`onRecover` is a new module hook.** It is the only way a module can credit what it holds (a sample) before the vessel is removed. Data items are credited by the sim from their `subject`.
- **Instruments have no editor category.** `science` is not one of the `MODULE_CATEGORIES`, and adding it is UI work (the editor lists). They show under "other" until the dock panel (191) or a catalogue pass adds one.
- **Sample mass is data only.** It does not change the part mass yet, as the plan says.

## Measurements

- Benchmark (`-t benchmark`): 10 vessels on rails, each with a module that asks for the situation every step, against the same vessels without the call: 5.9 to 13.6 µs per step alone on this machine, within noise under the full run. The budget is 50 µs (indicative here; Agent 1 measures on the M5).

## Follow-ups

- 104: regions in the subject id (`global` today) and dossiers. 105: spending science on the tech tree. 119: transmission through comms (today `transmit-data` is direct). 191: the dock panel. A `science` editor category.

## Verification output

```text
bun test packages/core/test/science.test.ts       pass
bun test packages/sim/test/science.test.ts        9 pass (benchmark alone: 5.9 µs/step for 10 vessels; under the full run: noise, -0.6 µs)
bun test packages/scripting                       60 pass
bun run docs:check                                exit 0
bun run test                                      1493 pass, 0 fail (274 s)
bun run typecheck                                 exit 0 (72 s)
bun run build                                     exit 0 (6 s)
bun run --filter @orbital/web test                902 passed, 1 skipped; 3 env-only import suites (no Node here)
```
