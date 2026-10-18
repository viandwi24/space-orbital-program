---
id: 105
title: "Tech tree and R&D"
status: in-progress
owner: "Agent 2"
depends: [103, 095, 102, 091, 094]
phase: 6
created: 2026-10-17
updated: 2026-10-18
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

- [x] `packages/sim` test: researching a node whose milestone is missing is refused with the milestone named.
- [x] vitest: a design with a locked part shows the node in the pre-flight verdict; Launch refuses it.
- [x] Pacing test (ADR 0154 point 6, relaxed from a career-bot test): each tier's cost sits in its band of the science yield of the flights that unlock it.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/105-tech-tree-and-rnd.md` written.
- [x] `guides/writing-a-mod.md` (tech nodes).
- [x] ADR 0154.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0099, 0098).
- 2026-10-17 — `depends` gains 094 (three-agent roadmap review, `docs/roadmap/team-development-roadmap.md` "Notes for the Lead"): the Launch refusal edits `routes/launch` of plan 094.
- 2026-10-18 — Claimed by Agent 2 (Dev B, M2).
- 2026-10-18 — Refined with ADR 0154: nodes and part `techNode`, `research`, locks at load-vessel, the Hangar and Launch; five stock tiers; pacing measured on the science model because the career bot earns no science (criterion relaxed); not patchable yet.
- 2026-10-18 — Built: core, SDK, sim and stock tree (API 0.1.55 at rebase; 124 took 0.1.54); the Hangar verdict, the Launch refusal and `/rnd` with the lab link in the Space Center. Criteria met; handed over as `ready/105`.
- 2026-10-18 — Merged by Agent 1: rebased on main (conflict in the ADR index, both kept); API_VERSION 0.1.55 set on the branch; bun test 1601 pass, web vitest 992 pass, typecheck, build, docs:check, smoke e2e 7 passed; launch and worlds e2e pass (Chromium).
