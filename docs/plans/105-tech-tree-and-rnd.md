---
id: 105
title: "Tech tree and R&D"
status: draft
owner: ""
depends: [103, 095, 102, 091, 094]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 105 — Tech tree and R&D

## Goal

Parts unlock through a tech tree: nodes cost science, tiers are gated by milestones as well as points, the R&D screen (refs style) shows the tree, and designs that use locked parts are flagged in the Hangar and refused at launch in worlds where the tree is on. The stock tree size is set by measurement with the career bot.

## Context

- ADRs: 0099, 0098
- Read: ADR 0099 point 4, `refs/space-orbital-program-ui/docs/SCREENS.md` (R&D).

## Scope

**In:**
- `defineTechNode({ id, tier, cost, requires, milestone, unlocks })`; parts may name their node.
- Research command, unlocked set in the world.
- R&D screen: tiers, node states (Unlocked, Can research, Locked), detail panel.
- Hangar flags and Launch refusal with the node to research.
- Pacing target stated at refinement (for example: tier 3 reachable after N career days by the bot).

**Out:** part upgrades and prototypes as science sinks (later).

## Touches

- **Size:** M
- **Edits:** `packages/sdk`, `packages/sim`, `mods/stock`, `apps/web/src/routes/rnd`, `apps/web/src/routes/vab`, `apps/web/src/routes/launch`
- **Shared contracts:** **SDK (`defineTechNode`, part `techNode`), save (unlocked nodes)**

## Design notes

No idle lab (ADR 0099). The tree is data, patchable.

## Steps

1. Schema and stock tree.
2. Research and gating.
3. R&D screen.
4. Pacing measurement.

## Acceptance criteria

- [ ] `packages/sim` test: researching a node whose milestone is missing is refused with the milestone named.
- [ ] vitest: a design with a locked part shows the node in the pre-flight verdict; Launch refuses it.
- [ ] Career-bot test: the stated tier is reached within the pacing band.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/105-tech-tree-and-rnd.md` written.
- [ ] `guides/writing-a-mod.md` (tech nodes).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0099, 0098).
- 2026-10-17 — `depends` gains 094 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): the Launch refusal edits `routes/launch` of plan 094.
