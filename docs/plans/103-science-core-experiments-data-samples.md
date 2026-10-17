---
id: 103
title: "Science core: experiments, situations, subjects, data and samples"
status: done
owner: "Agent 3"
depends: [083, 078]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 103 — Science core: experiments, situations, subjects, data and samples

## Goal

Experiments produce science on a matrix of experiment × body × situation × region with caps and diminishing returns; results are data items (transmittable at a factor or recovered whole) or samples (recovered physically); experiment states are READY, RUNNING, PAUSED or INVALID with reasons; recovery and transmission credit science to the ledger; scripts can run experiments.

## Context

- ADRs: 0099 (points 1, 2, 6), 0172 (data items), 0113 (ledger), 0176 (crew `dataQuality`, not applied here), 0178 (written in step 1: situations, subjects, value curve, states, credit).
- Read: ADR 0099, `refs/reverse-engineering-ksp2/05-science-and-research.md`, plan 083's `packages/sim/src/data.ts`, the crew recovery hook in `packages/sim/src/crew.ts`, `packages/scripting/src/telemetry.ts` and `prelude.ts`, `apps/web/src/lib/script-api.ts`, the science rules in `mods/stock/src/rules.ts`.
- Regions are a single "global" region per body until plan 104.

## Scope

**In:**
- `defineSituation({ id, label, order, matches })` with a pure `matches(view)` over `{ landed, splashed, altitude, atmosphereHeight, flyingHigh, spaceHigh }`; the first matching situation by `order` wins. Stock: `landed`, `splashed`, `flying-low`, `flying-high`, `space-low`, `space-high`. Per-body thresholds are data: an optional body field `science: { flyingHigh?, spaceHigh?, multiplier? }` (stock home 18 km and 250 km, the moon 60 km); without it, a quarter of the atmosphere height and the larger of the atmosphere height and 0.4 radius.
- `defineExperiment({ id, label, kind: data | sample, situations, baseValue, repeatFactor, duration, power?, bits?, mass?, transmitFactor })`. Subjects are `<experiment>@<body>:<situation>:global`. A run's value is `min(cap − produced, base × body multiplier × repeatFactor^count)` with `cap = base × multiplier × capFactor` (3 × base by default); the subject records `count` and `produced` at generation and `credited` when science is credited.
- Module `stock.experiment` (config `experiment`): states `READY`, `RUNNING`, `PAUSED` (no power, with a reason), `INVALID` (wrong situation, or a sample held, with the reason); action `run`; data results go to `ctx.vessel.data.store` (kind `stock.science`, `subject`, `meta.transmitFactor`), sample results stay in the module until recovery.
- `ctx.vessel.situation()` (cached per vessel at most once per second of sim time, and on SOI and landed changes).
- `transmit-data { vessel, item }`: credits value × the item's transmit factor and deletes the item. It is direct while plan 119 does not exist (comms off or on).
- `recover-vessel`: credits every science data item aboard and every held sample in full, by subject.
- Credit: `science` ledger entries (cause `science.<experiment>`, ref the subject) × `stock.science-multiplier`, when `stock.tech-tree` is on (ADR 0099 point 6: no science currency in Sandbox); subjects are counted in every mode.
- `Snapshot.science` (subjects) and `VesselSnapshot.science` (experiments with state and reason); `SimSave.science` optional in format 5, written once a subject exists.
- Script API: `ship.science` (part, experiment, state, reason) and `runExperiment(idOrPart)`; documented in `apps/web/src/lib/script-api.ts`.
- Stock experiments on five new parts: thermometer, barometer, seismometer (data) and surface sample and atmosphere sample (samples).

**Out:** regions and dossiers (104), tech tree (105), discovery (129); the science dock panel and HUD card (draft 191, after the dock of 112); sample mass on the part's mass (a sample's `mass` is data until a later plan); the crew `dataQuality` factor (applied with 107/111).

## Touches

- **Size:** L
- **Edits:** `packages/core` (`science.ts` new, `schemas.ts` body `science`, `registry.ts`, `plugin.ts`, `definitions.ts` `VesselApi.situation`, `protocol.ts`, `protocol-schemas.ts`, `events.ts`, `save.ts`, `version.ts`, `index.ts`), `packages/sdk`, `packages/sim` (`science.ts` new, `hooks.ts`, `commands.ts`, `snapshot.ts`, `save.ts`, `core.ts`, `sim.ts`, tests), `packages/scripting` (`telemetry.ts`, `prelude.ts`, tests), `mods/stock` (situations, experiments, module, parts, body thresholds, tests), `apps/web/src/lib/script-api.ts`, `docs/architecture/simulation.md`, `docs/guides/writing-a-mod.md`, `docs/guides/scripting.md`
- **Shared contracts:** **SDK (`defineExperiment`, `defineSituation`, `VesselApi.situation`, body `science`; `API_VERSION` patch bump), save (optional `SimSave.science`), protocol (`transmit-data`, events, `Snapshot.science`, `VesselSnapshot.science`), script API (`ship.science`, `runExperiment`), load report kinds `experiment`, `situation`**

## Design notes

Situation is computed on events and at most once per second of sim time per vessel with experiments; measured.

## Steps

1. ADR 0178; schemas, registries, situation classification, subject value maths; core tests.
2. Sim: situation cache, experiment module and states, results as data items or held samples.
3. Subjects in the world, transmit and recovery credit, snapshot and save.
4. Stock situations, experiments, module, parts and body thresholds.
5. Scripts: `ship.science`, `runExperiment`; script API docs.
6. Benchmark; draft 191 for the dock panel.

## Acceptance criteria

- [x] `bun test packages/sim/test/science.test.ts`: running the same experiment in the same situation three times yields `base × r^0, base × r^1, base × r^2` (the declared curve) and a fourth run never takes the subject past its cap.
- [x] Same file: a sample is credited only on recovery (no ledger entry before); transmitting data credits value × factor and removes the item.
- [x] Same file: an experiment started in a wrong situation is `INVALID` with the current situation in the reason; without power it is `PAUSED`.
- [x] Same file, `-t benchmark`: situation checks add under 0.05 ms per step for 10 vessels ¹ (M5 by Agent 1; indicative here).
- [x] `bun test packages/scripting`: `ship.science` lists the experiments and `runExperiment` sends the `run` action.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/103-science-core-experiments-data-samples.md` written.
- [x] `architecture/simulation.md`, `guides/writing-a-mod.md`, `guides/scripting.md`.
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0099).
- 2026-10-17 — Refined and claimed by Agent 3. Science credit is gated by `stock.tech-tree`, not by the economy rule, which is Career only: ADR 0099 point 6 gives the Science preset science without money. The HUD card moves to draft 191, after the dock of 112. Sample mass is data only. Design choices go in ADR 0178.
- 2026-10-17 — Implemented by Agent 3 and handed over as `ready/103`. Stock situation ids are `stock.*` because registry ids need a plugin prefix. Splashed needs terrain below sea level. A new module hook, `onRecover`, credits held samples. The snapshot classifies the situation without the cache. Benchmark: 6 to 14 µs per step for 10 vessels here. Journal: `journal/103-science-core-experiments-data-samples.md`.
- 2026-10-18 — Merge check (Agent 1, M5): rebased on main after 088 without conflicts; API_VERSION stays 0.1.40 (first of 103, 085, 114 to merge). `bun run test` 1497 pass · web vitest 926 pass (the full run Agent 3 could not do) · typecheck · build · docs:check OK · Chromium smoke 6 pass. `-t benchmark` on the M5, nothing else running: situation checks 0.7 µs per step for 10 vessels (budget 50 µs).
