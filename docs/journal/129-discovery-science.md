# 129 — Discovery science: hidden facts, instruments, lab levels and peer review

**Plan:** plans/129-discovery-science.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode · **ADRs:** [0192](../decisions/0192-discovery-science-facts-measurements-levels-claims-review.md) (new), [0099](../decisions/0099-science-matrix-data-samples-dossiers-and-tech-tree.md) point 5, [0178](../decisions/0178-science-situations-subjects-value-curve-states-credit.md), [0180](../decisions/0180-regions-on-bodies-regional-situations-and-dossiers.md), [0123](../decisions/0123-construction-on-the-tick-capacity-keys-upkeep.md) · **Research:** `refs/reverse-engineering-ksp2/beyond/04-science-beyond-ksp.md` (git-ignored); no new research note

**Status when written: criteria met here, handed over as `ready/129`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/discovery.ts` (new) | `DiscoveryFactDefinition` and its schema; `factValue` (one stream per body and kind); `normal`; `reviewScore` (scaled Brier, priority factor); `DATA_LEVELS`, `LEVEL_ERROR`, `DISCOVERY_PROCESS_DAYS`, `DISCOVERY_REVIEW_DAYS`, `DISCOVERY_REPUTATION`, `DISCOVERY_SECOND_FACTOR`; `SaveDiscovery` and its schema; `DiscoverySnapshot` |
| `packages/core` | the `discoveryFacts` registry, `ctx.discoveryFacts`, report kind `discovery-fact`; the commands `discovery-process` and `discovery-claim`; the event `discovery:reviewed`; `Snapshot.discovery`; `SimSave.discovery` (optional, no format bump); `science.result` may return `meta`; `discoveryDossier` and `Dossier.discovery`; `API_VERSION` 0.1.72 (126 took 0.1.70, 120 0.1.71) |
| `packages/sdk` | `defineDiscoveryFact`; the types, `factValue` and `reviewScore` re-exported |
| `packages/sim/src/discovery.ts` (new) | `measure` (on a data result), `intakeData` (on transmit, delivery and recovery), lab slots from `lab`, `processDataset`, `claimFact`, `discoveryTick` (lab completion and review), the snapshot, fresh and touched |
| `packages/sim` | wired into `makeResult`, `transmitData`, `recoverScience`, the comms delivery, the world tick (after contracts), commands, init, save and snapshot |
| `mods/stock` | three fact kinds: Polar ice (thermometer), Magnetic field (thermometer and barometer), Subsurface ocean (seismometer); the experiment module copies the result's meta onto the data item |
| `apps/web` | the dossier's Discovery entry in `BodyCard.svelte`: facts open or settled, the best dataset, datasets in the lab, a Process button, a claim form (value, confidence 50 to 95 %), the claims with verdicts, priority and reputation. `TargetPanel` passes `oncommand`. The Mission Center's Upcoming lists claims in review (`kind: 'review'`) |
| tests | `packages/sim/test/discovery.test.ts` (4); web `BodyCard.test.ts` (+3), `mission-center/model.test.ts` (+1) |
| docs | ADR 0192; `simulation.md` "Discovery science"; `plugin-system.md`; the guide's "Discovery facts"; the glossary |

## Decisions and deviations

- **Facts are derived, not saved** (ADR 0192 point 2). Each body and kind has its own stream, so adding a body or a kind does not move the others. The plan's "save (facts, claims)" became: the save holds the claims, the datasets and the stream state. The facts come back from the seed.
- **The error shrinks exactly** (ADR 0192 point 5). A level scales the dataset's deviation from the truth by the level's error ratio, with no new draw. Processing therefore always improves the data, and the test can state the factor.
- **The scaled Brier score** `20 × (1 − 4(o − c)²)` is proper, and confidence 0.5 scores 0.
  - At 0.9 confidence: right +19.2, wrong −44.8.
  - At 0.6 confidence: right +7.2.
  - Confidence below 0.5 is refused. A claim of "absent" is a value of 0.
- **Priority** is the first accepted claim per body and fact. A later correct claim gains a quarter, and losses are never reduced. Rival agencies (126) do not claim yet; their claims can join later without a save change.
- **Lab slots** are the primary site's `lab` capacity. With no lab building, the capacity is null (no limit), as with the other capacity keys.
- **Samples carry no measurement.** The meta lives on data items, and a held sample is credited through `science.credit` without one.
- **Mission Center:** the plan says "review news". Pending reviews show in Upcoming, with warp-to. The verdicts show in the dossier and as the `discovery:reviewed` event. A news line in the agencies' feed was left out (see Follow-ups).
- **Edits outside the plan's listed paths:**
  - `packages/core`, for the registry, protocol, save and dossier, listed as shared contracts;
  - `apps/web/src/lib/hud-controller.ts`, `routes/flight/+page.svelte` and `lib/mission-center/model.ts`.

## Measurements

- Seed 11, home planet: polar ice 24.9 %, magnetic field 51.8 μT, no subsurface ocean.
- Seed 7: none of the three.
- The tests use seed 11, so the home planet has a fact to measure.

## Follow-ups

- Rival agencies making claims, and review verdicts in the Mission Center news feed. This needs an agency claim model (ADR 0190, 0192 consequences).
- A dedicated magnetometer part. The stock thermometer and barometer stand in as instruments.

## Verification output

See the handover tag `ready/129`. The checks are `bun run check:affected` here, and the full suite in CI (ADR 0126).
