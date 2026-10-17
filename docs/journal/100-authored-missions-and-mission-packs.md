# 100 — Authored missions, the story line and mission packs

**Plan:** [plans/100-authored-missions-and-mission-packs.md](../plans/100-authored-missions-and-mission-packs.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0151](../decisions/0151-missions-briefings-next-missions-scenarios-and-the-tracker.md) (new), [0098](../decisions/0098-progression-economy-career-and-milestones.md), [0175](../decisions/0175-objective-trees-scheduling-vessel-binding-and-save.md), [0149](../decisions/0149-define-panel-view-nodes-panel-input-canvas-and-the-dock.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| core | `MissionDefinition` gains `briefing`, `debriefing`, `next`, `line`; `ScenarioDefinition`, `scenarioDefinitionSchema`, `scenarioPlacement` (circular equatorial orbit from the body's mass, or the site); `registries.scenarios`, `ctx.scenarios`, report kind `scenario`; API_VERSION 0.1.53 |
| SDK | `defineScenario`, `scenarioPlacement`, types |
| sim | a done mission starts its `next` missions (unbound) whose prerequisites are met |
| stock | the main line `stock.main`: First launch, Into space, Orbit, To the Moon, Landing on the Moon, Home from the Moon |
| web | `lib/missions/tracker.ts` and `MissionsPanel.svelte` (the `host.missions` dock panel: active missions with each objective's progress, missions on offer with briefing and Start, the last debriefing); `scenario-start.ts`; Create World "Start" choice; `WorldRecord.scenario`; the first flight of a scenario world loads its vessels and starts its missions |
| `examples/mod-sample` | the "Relay in orbit" pack and its mission |
| tests | sim `missions.test.ts` (2), web `missions/tracker.test.ts` (2), `missions/scenario.test.ts` (1: the pack's world, the relay in a 100 km orbit, its mission active) |

## What surprised me

- **Nothing registered a mission yet.** Plan 098 built the evaluator and the command; no mission, no UI started one. The main line is the first content.
- **"Unlocks" became "starts".** A story line that waits for a click after every step would feel like a form; `next` missions start on completion, other missions stay the player's choice (ADR 0151 point 1).
- **The first-flight guide stays.** It teaches keys step by step; the first mission asks for the same first step, so the two agree without replacing the guide.
- **Starting vessels need a home.** World info is identity and rules; the record carries `scenario`, and the first flight (no save yet) loads the pack's vessels.
- **Designs in a mod need branded part ids** (`partId` from the SDK) to typecheck.
- The `placement` option of the flight loop is written exactly as in 094 (unmerged at the time) so the two merge cleanly.
