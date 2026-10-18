# 105 — Tech tree and R&D

**Plan:** [plans/105-tech-tree-and-rnd.md](../plans/105-tech-tree-and-rnd.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0154](../decisions/0154-tech-tree-nodes-research-locks-and-pacing-by-science-yield.md) (new), [0099](../decisions/0099-science-matrix-data-samples-dossiers-and-tech-tree.md), [0098](../decisions/0098-progression-economy-career-and-milestones.md), [0147](../decisions/0147-milestones-in-the-sim-achievements-in-the-page.md) · **Research:** none

**Status when written: criteria met here; pacing measured on the science model (criterion relaxed in ADR 0154 point 6).**

## What was done

| Where | What |
|---|---|
| `packages/core/src/tech-tree.ts` | `TechNodeDefinition` and schema, `SaveTech`, `isFreeNode`, `isResearched`, `nodeOfParts`, `lockedParts`, `researchProblem`; part `techNode`; `registries.techNodes`, report kind `tech-node`; `SimSave.tech?` (optional in format 5); command `research`; `Snapshot.tech`; API_VERSION 0.1.55 (0.1.54 went to 124) |
| `packages/sdk` | `defineTechNode`, the tree helpers, `subjectCap` |
| `packages/sim/src/tech.ts` | research spends science through the ledger (`tech.research`), the lock refusal at `load-vessel`, save, resume, snapshot; Sandbox refuses with "this world has no tech tree" |
| `mods/stock/src/tech.ts` | nine nodes over five tiers, the tier-0 Basics free; tiers 2 to 4 gated by the home orbit, the Cinder flyby and the Cinder landing |
| web | `lib/tech/world-tech.ts` (the world's tree from its newest save), the `locked` no-go in the Hangar's verdict, the Launch screen's refusal, `/rnd` (`lib/tech/rnd-model.ts`), the lab's "Open R&D" in the Space Center |
| tests | sim `tech.test.ts` (4), stock `tech.test.ts` (5, pacing), web `tech/world-tech.test.ts` (3), `tech/rnd-model.test.ts` (2), `space-center/model.test.ts` (+1) |

## What surprised me

- **The career bot earns no science.** It flies to orbit without experiments, so a bot-measured pacing test would measure nothing. The bands come from the science model instead: the first ascent yields 62, Home caps at 471, a Cinder flyby at 48 and a Cinder landing at 498 (ADR 0154 point 6).
- **Locking parts broke other systems' tests.** Science, comms and life-support tests launch stock parts in Career worlds; they now load a small `openTree` plugin (a free node unlocking every stock part). A part is unlocked by any researched node that names it, so the helper works beside the stock tree.
- **One check per lock collided.** The verdict keys checks by id; the locks are one combined `locked` check naming every locked part and node.
- **Every page reads the world's newest save.** The Hangar and the Launch screen have no sim; they read research from the newest save of the active world, or none from its start info.
- Same environment notes as before: `sim-host-script-worker.test.ts` (2 vitest) fails on this machine on main too.
