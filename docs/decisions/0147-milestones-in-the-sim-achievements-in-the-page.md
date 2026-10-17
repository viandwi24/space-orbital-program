# 0147 — Milestones in the sim, history from them, achievements as data in a page profile

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [102](../plans/102-milestones-history-and-achievements.md)
**Builds on:** ADR 0098 point 6 (milestones, history, achievements), ADR 0175 (objectives: the vessel view), ADR 0176 point 4 (crew places), ADR 0113 (ledger and reputation), ADR 0110 (save format 5, optional fields), ADR 0141 (calendar)

## Context

ADR 0098 asks for automatic firsts per world (launch, orbit, flyby, landing, return, crewed, EVA, docking, station, full relay network, sample return), a history book, and local achievements across worlds. EVA, docking, stations, relays and samples do not exist in the sim yet. Open: which kinds now, where detection runs, what is saved, how history relates to milestones, what an achievement's criteria are, and where the profile lives.

## Decision

1. **Kinds that exist now.** `launch` (a vessel off the ground above 1 km over its body), `orbit:<body>` (periapsis above the body's atmosphere, e < 1, the crew-places rule), `flyby:<body>` (in a body's sphere of influence other than home), `landing:<body>` (landed on a body other than home) and `return:<body>` (a recovered vessel that had orbited, flown by or landed on that body; `return:<home>` after an orbit of home). Each also has a crewed record when crew was aboard: `crewed-orbit:<body>` and so on. The milestone id is the kind plus the body (`orbit:stock.home`); `launch` has no body. EVA, docking, station, relay and sample-return are added by the plans that bring those systems (109, 113/117, 103), as more kinds.
2. **Detection in the sim, once per world.** A built-in sim module (`milestones.ts`, like objectives) checks every vessel after each step and rails chunk, using the objectives vessel view; each vessel keeps the places it has been since launch for `return`. A first record emits `milestone:reached { id, kind, body?, vessel, crewed, time }` and is never recorded again in that world.
3. **Saved as data.** `SimSave.milestones?: { records: { id, kind, body?, crewed, vessel, title?, time }[]; visits: Record<vessel, place[]> }`, optional in format 5 (absent = none), so no format number. The snapshot carries the records.
4. **History is the records, formatted in the page.** The history book lists the records in time order with the world's calendar date (`formatDate`), and exports as Markdown (one line per record) and JSON. Text is made in the page, not stored, so wording can change without a migration.
5. **Reputation when the economy is on.** A first pays reputation through the ledger (cause `milestone`, ref the id): launch 5, orbit 10, flyby 15, landing 20, return 10; a body other than home doubles it, a crewed record adds half. No science from milestones (science comes from 103's experiments); tech tiers (105) read the records.
6. **Achievements are data, evaluated in the page.** `defineAchievement({ id, label, description, hidden?, criteria: { milestone, body?: 'home' | 'away' | <body id>, crewed? } })` in a core registry; stock registers a starter set. They span worlds, so the page evaluates them: on each `milestone:reached` forwarded from the worker, and over a world's records when a save loads (nothing is missed for good).
7. **The profile is local.** IndexedDB `orbital-profile`, store `profile`, one record `{ format: 'orbital-profile', version: 1, unlocked: { [id]: { at, world } } }`; export and import as a JSON file; an import merges (keeps the earliest unlock).

## Alternatives considered

- **Milestones as objectives (098)** — rejected: objectives are started, paid and finished per contract; a first is recorded once per world without being started.
- **History as stored sentences** — rejected: text would freeze wording and units into saves.
- **Achievements in the sim** — rejected: they span worlds; the sim belongs to one.
- **A save format bump** — not needed: optional fields in format 5, as 095, 098, 103 and 106 did.

## Consequences

- Core: `MilestoneRecord`, `SaveMilestones`, `AchievementDefinition` and their schemas; `milestone:reached` in `EventMap`; `registries.achievements`; SDK `defineAchievement`; API_VERSION bump.
- The web worker forwards `milestone:reached`; the HUD shows a ceremony toast; the Worlds screen shows the history and the export.
