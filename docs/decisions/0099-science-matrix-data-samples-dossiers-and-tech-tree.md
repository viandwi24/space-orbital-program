# 0099 — Science: an experiment matrix, data and samples, body dossiers, a tech tree; classic points by default, discovery optional

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner decisions "science-model", "science-depth", 2026-10-17); delivered by plans 083, 103, 104, 105, 129
**Builds on:** ADR 0094 (rules), 0096 (background operations), 0098 (currencies, milestones).
**Research:** `refs/reverse-engineering-ksp2/05-science-and-research.md`, `10-celestial-bodies-and-world.md`, `beyond/04-science-beyond-ksp.md`.

## Context

Orbital has no science, experiments or biomes, and every part is unlocked. Tree size sets the pacing (the research cites a KSP1 tree that finishes too fast and a KSP2 tree that feels grindy; the figures are unverified and not used here). Splitting transmittable data from samples that must come home creates real logistics, and ties science to comms and recovery.

## Decision

1. **Matrix.** A science **subject** is experiment × body × situation × region (biome). Each subject has a cap and diminishing returns per repeat. Experiments (`defineExperiment`), situations (extensible by mods) and regions are data. Experiment state is always one of READY, RUNNING, PAUSED, INVALID (with the reason), and scripts can automate runs.
2. **Data and samples.** An experiment produces either **data** (a sized data item, ADR 0101 tier 4 and plan 083, that can be transmitted at a transmission factor or recovered whole) or a **sample** (mass in a container, recovered physically). Transmission goes through the comms contribution when comms is on; with comms off by rule, data is transmitted directly at the same factor.
3. **Dossiers.** Results fill a **dossier** per body (atmosphere profile, gravity, surface, resource hints, regions found), shown in the Mission Center; dossier entries unlock gameplay such as resource hints and better landing predictions.
4. **Tech tree.** `defineTechNode` nodes cost science, are grouped in tiers gated by milestones as well as points (reach orbit, land on the moon), and the stock tree is sized for pacing by measurement (plan 105 states the target in game days of the career bot, ADR 0098). Science also buys part upgrades and prototypes. There is **no idle lab** that converts time into unlimited science. Designs that use parts locked in the current world are flagged in the Hangar.
5. **Science depth is a world rule**: `classic` (default, points as above) or `discovery` (optional, built after data items and comms tier 4): hidden facts per body from the world seed, instruments with resolution and error, data levels raw / calibrated / derived, claims with confidence judged by peer review, publication priority.
6. Presets: Sandbox has no tech tree and no science currency (experiments still fill dossiers), Science has science and the tree without money, Career has everything.

## Alternatives considered

- **Points only, no data or samples** — rejected: no logistics, nothing for comms to carry.
- **Discovery science as the default** — rejected by the owner: harder for casual players; it stays optional.
- **An MPL-style lab** — rejected: the research found it farmed without limit.

## Consequences

- **Mod API:** `defineExperiment`, `defineSituation`, region data on `defineBody`, `defineTechNode`; parts list the nodes that unlock them (additive, patchable, ADR 0104).
- **Save format:** subjects collected, stored data items and samples on vessels, dossiers and unlocked nodes are world or vessel components (format bumps with migrations in plans 083 and 103).
- **Body data:** regions are a body-level map (core, environment-neutral) that the renderer can draw on the map; the planet pass is unchanged.
- **Performance:** situation and region checks run on events and at most once per second of sim time per vessel with experiments; plan 103 measures under the 4 ms step budget.
- Follow-ups: plans 083 (data items), 103 (science core), 104 (regions, dossiers), 105 (tech tree), 129 (discovery layer).
