# 0154 — Tech tree: nodes, research, locks at the Hangar and at launch, pacing by science yield

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [105](../plans/105-tech-tree-and-rnd.md)
**Builds on:** ADR 0099 point 4 (the tree, tiers gated by milestones, no idle lab), ADR 0099 point 6 (Sandbox has no tree), ADR 0178 (science values), ADR 0147 (milestones), ADR 0148 (pre-flight levels), ADR 0150 (Launch screen), ADR 0152 (pages run the world from its newest save)

## Context

Plan 105 adds `defineTechNode`, research with science, milestone gates, an R&D screen, locks in the Hangar and at launch, and a pacing target. The rule `stock.tech-tree` already exists (off in Sandbox, on in Science and Career); science reaches the ledger only while it is on. The career bot of plan 095 places and recovers vessels for funds: it earns no science and reaches no milestone.

## Decision

1. **Nodes.** `TechNodeDefinition { id, label, tier, cost, requires?, milestone?, unlocks? }`; a part may also name its node (`PartDefinition.techNode`). A part is locked when some node unlocks it and that node is not researched; a part no node names is never locked, so mods without tree data stay usable.
2. **Research.** `research { node }`: refused with a sentence when the tree is off, the node is unknown or done, a required node is missing (named), the milestone is not recorded (named, ADR 0147 ids), or science is short (have and need). It spends the cost through the ledger (`tech.research`) and records the node. A node of cost 0 with no requirement and no milestone counts as researched from the start (the basics).
3. **Saved and shown.** `SimSave.tech?: { researched }` (optional in format 5); `Snapshot.tech?: { enabled, researched }`.
4. **Locks.** With the tree on, `load-vessel` refuses a design with locked parts, naming the part and its node. The Hangar shows a `locked` check (an error, no-go) naming the node, from the active world's newest save; the Launch screen says the same and disables Launch.
5. **The stock tree** has five tiers: Basics (0, the parts of the reference rockets), Science instruments and Structures (tier 1), Propulsion, Probes and Aerodynamics (tier 2, gated by the first orbit of Home), Landing and Deep-space comms (tier 3, gated by a Cinder flyby), Life support (tier 4, gated by a landing on Cinder).
6. **Pacing by science yield.** The career bot earns no science, so pacing is measured on the science model: the first results of the temperature and pressure experiments on an ascent to orbit (landed, flying low, flying high, space low at Home) pay for tier 1 and most of tier 2; a Cinder flyby's space results are needed for tier 3. A test computes these yields with `nextValue` and checks each tier's cost against its band.
7. **Not patchable yet.** Tech nodes are not a `definePatch` target in this plan (a follow-up adds the target and its provenance key).

## Alternatives considered

- **Extend the career bot to fly experiments** — rejected for this plan: the bot places vessels and recovers them; flying an ascent per mission would make a 3 600-day run take minutes. The model-based yield is the same arithmetic the sim uses.

## Consequences

- Core and SDK: `TechNodeDefinition`, `defineTechNode`, `registries.techNodes`, `PartDefinition.techNode`, `lockedParts`; protocol `research`; save `tech`; API_VERSION bump.
- Web: `/rnd`, the Hangar `locked` check, the Launch refusal, the Space Center link.
