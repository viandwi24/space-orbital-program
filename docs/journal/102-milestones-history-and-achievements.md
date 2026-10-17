# 102 — Milestones, world history and local achievements

**Plan:** [plans/102-milestones-history-and-achievements.md](../plans/102-milestones-history-and-achievements.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0147](../decisions/0147-milestones-in-the-sim-achievements-in-the-page.md) (new), [0098](../decisions/0098-progression-economy-career-and-milestones.md), [0175](../decisions/0175-objective-trees-scheduling-vessel-binding-and-save.md), [0176](../decisions/0176-crew-roster-places-xp-seats-death-salaries.md), [0113](../decisions/0113-economy-core-ledger-costs-charges-recovery.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `packages/core/src/milestones.ts` | `MILESTONE_KINDS` (launch, orbit, flyby, landing, return), `MilestoneRecord`, `SaveMilestones` and schemas, `milestoneId`, reputation per first (`milestoneReputation`, cause `milestone`), `AchievementDefinition` and its schema, `achievementMatches` |
| core `save.ts`, `events.ts`, `protocol.ts`, registries | `SimSave.milestones?` (optional in format 5), `milestone:reached`, `Snapshot.milestones`, `registries.achievements`, `ctx.achievements`, report kind `achievement`; API_VERSION 0.1.44 (0.1.40 to 0.1.43 went to 103, 085, 114 and 069) |
| `packages/sdk` | `defineAchievement`, `achievementMatches`, `milestoneId`, `MILESTONE_KINDS`, types |
| `packages/sim/src/milestones.ts` | the detector after each step and rails chunk (controlled vessels only), per-vessel visits that a split vessel inherits, `return` at `recover-vessel`, reputation through the ledger, save, resume, snapshot |
| `mods/stock/src/achievements.ts` | seven starter achievements (one hidden) |
| web `achievements/` | `profile.ts` (unlock, merge, parse, serialise), `store.ts` (IndexedDB `orbital-profile`, memory fallback), `tracker.ts` (queued unlocks during a flight), `milestone-text.ts` (wording), `AchievementsPanel.svelte` |
| web flight | the worker forwards `milestone:reached`; a success toast for every first; the catalog carries achievements and the world id; the loaded world's records are checked once |
| web worlds | `worlds.milestones(id)` from the newest readable save; `WorldHistory.svelte` (dates in the world calendar, Markdown and JSON export); the achievements panel with export and import; `lib/download.ts` |
| tests | sim `milestones.test.ts` (4), stock `achievements.test.ts` (2), web `achievements/profile.test.ts` (4), `achievements/tracker.test.ts` (3), `worlds/history.test.ts` (3), `worlds.test.ts` (+1) |

## What surprised me

- **Half the kinds have no system yet.** No EVA, docking, stations, relays or samples exist in the sim; the detector covers what can happen today and ADR 0147 leaves the rest to the plans that add those systems.
- **The sim has no launch, orbit or landing events.** Detection reads state after each step (the objectives vessel view and the crew places rule), not events.
- **"stone" is in "milestones".** The stones test asserted the save text never contains "stone"; it now ignores the word "milestone" and still proves no stone data is saved.
- **A `return` needs memory per vessel.** A recovered capsule is not the vessel that reached orbit (staging makes new vessels), so a split vessel inherits its parent's visits.
- **Debris does not make firsts.** Only vessels with a control source count; a spent stage reaching orbit is not the world's first orbit.
- The ascent test: launch at 17.7 s, first orbit at 230.3 s, exactly once, on the step the periapsis clears the 70 km atmosphere.
- Prettier on `apps/web/src/lib` touched four files from main that are not formatted (`script-api.ts`, `script-api-members.test.ts`, `space-center/model.test.ts`, `trajectory-golden.test.ts`); left as they are, noted for the Lead.
