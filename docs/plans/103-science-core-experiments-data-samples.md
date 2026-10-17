---
id: 103
title: "Science core: experiments, situations, subjects, data and samples"
status: draft
owner: ""
depends: [083, 078]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 103 — Science core: experiments, situations, subjects, data and samples

## Goal

Experiments produce science on a matrix of experiment × body × situation × region with caps and diminishing returns; results are data items (transmittable at a factor or recovered whole) or samples (recovered physically); experiment states are READY, RUNNING, PAUSED or INVALID with reasons; recovery and transmission credit science to the ledger; scripts can run experiments.

## Context

- ADRs: 0099
- Read: ADR 0099, plan 083 (data items), `refs/reverse-engineering-ksp2/05-science-and-research.md` (git-ignored).
- Regions are a single "global" region per body until plan 104.

## Scope

**In:**
- `defineExperiment`, `defineSituation` (stock situations: landed, splashed, flying low, flying high, space low, space high; thresholds per body as data).
- Experiment module: duration, power, data size or sample mass, states and reasons.
- Subject registry per world: collected, cap, next value.
- Transmit: direct at the factor when comms is off or absent; through the `comms` contribution later (119).
- Recovery credits data and samples by subject.
- Script API: `ship.science` list and `runExperiment(id)`.
- Stock experiments (4 to 6) as parts or modules.

**Out:** regions and dossiers (104), tech tree (105), discovery (129).

## Touches

- **Size:** L
- **Edits:** `packages/core`, `packages/sdk`, `packages/sim`, `packages/scripting`, `mods/stock`, `apps/web/src/lib/script-api.ts`, `apps/web/src/lib/hud`
- **Shared contracts:** **SDK (`defineExperiment`, `defineSituation`), save (subjects, samples), protocol (run, transmit), script API**

## Design notes

Situation is computed on events and at most once per second of sim time per vessel with experiments; measured.

## Steps

1. Schemas and registries.
2. Experiment module and states.
3. Subjects and value curve.
4. Transmit and recover.
5. Scripts.
6. Science dock panel (HUD card until 112).

## Acceptance criteria

- [ ] `packages/sim` test: running the same experiment in the same situation three times yields values following the declared diminishing curve and never exceeds the cap.
- [ ] `packages/sim` test: a sample is credited only on recovery; transmitting data credits value × factor and removes the item.
- [ ] `packages/sim` test: an experiment started in a wrong situation is INVALID with the situation in the reason.
- [ ] Benchmark: situation checks add under 0.05 ms per step for 10 vessels (M5).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/103-science-core-experiments-data-samples.md` written.
- [ ] `architecture/simulation.md`, `guides/writing-a-mod.md`, `guides/scripting.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0099).
