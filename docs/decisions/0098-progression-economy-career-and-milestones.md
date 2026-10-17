# 0098 — Progression: a full resource economy, capacity-only gates, contracts and missions on one evaluator, strategies, milestones and achievements

**Status:** accepted
**Date:** 2026-10-17
**Plan:** none (owner decisions "economy-model", "progression-gates", "career-shape", "online-features", 2026-10-17); delivered by plans 095 to 102, 126, 131
**Builds on:** ADR 0094 (worlds and rules), 0096 (world tick), 0097 (sites and buildings).
**Research:** `refs/reverse-engineering-ksp2/06-missions-contracts-achievements.md`, `07-economy-and-career.md`, `beyond/02-player-roles-and-fantasies.md`, `beyond/03-world-and-economy-dynamics.md`, `beyond/06-achievements-milestones-and-meta.md`.

## Context

Without costs, design efficiency, reuse and risk mean nothing (the research's lesson from KSP2); with KSP1-style costs, money piles up in mid-game. The "investor" and "operator" fantasies depend on this choice. The research recommended three currencies with running costs, and resources as a second layer later. **The owner chose a full resource economy with markets and production from the start**, knowing it is the deepest and riskiest option (XL, may not finish). For gates, the owner chose capacity and scale only: core flight tools are never locked. For career, both authored missions and systemic procedural contracts. For online features, everything stays local and file-based.

## Decision

1. **Currencies and resources.** Each world keeps a **ledger** of three currencies (funds, science, reputation) and of **commodities** (stock: propellants, structural materials, and the services a market prices: launches, comms capacity, data, crew seats, insurance). Every change is a ledger entry with a cause, so every number shows why it moved. Parts and buildings carry costs (dry plus contents for parts); recovery of any stage is simulated physically and paid by a visible formula (distance to a recovery facility, speed, damage, sea or land).
2. **Markets and production from the start.** Prices of commodities respond to supply and demand on the world tick; production buildings (a propellant plant first) turn inputs into commodities with upkeep and power. Agencies (ADR 0096) and world demand are the other market actors.
3. **Gates are capacity and scale only.** Building levels and tech raise part count, launch mass, pad size, crew capacity, contract slots, network power and prediction quality. Maneuver nodes, Δv read-outs, the map, targets, SAS modes and scripting are never locked by a building, a level or a crew skill. A design that exceeds a limit shows which limit and which upgrade lifts it, before launch.
4. **Career content: one evaluator.** Contracts and missions are data (`defineContract`, `defineMission`) built from one library of **deterministic objective primitives** (reach orbit, land in a region, return a sample, hold a comms link, deliver a payload, by a date), evaluated on events and on the world tick. Procedural contracts are generated from templates with the seeded PRNG (fewer but better, expected value shown, deadlines tied to transfer windows); authored missions form the story line in the Mission Center and can be shipped as **mission packs**; a mission can be scripted with the same primitives.
5. **Strategies** are policies (`defineStrategy`) that change multipliers within stated bounds, with their ratio, cap, an N-day projection and an upkeep visible before activation. A director layer (programmes, board reviews, insurance, staff) comes later on the same data.
6. **Milestones, history, achievements.** Per world: automatic records per body and global (first launch, orbit, flyby, landing, return, crewed, EVA, docking, station, full relay network, sample return), a world history book ("Day 341: ...") that can be exported, and races for firsts with agencies. Per player, across worlds: local **achievements** (`defineAchievement`) that teach mechanics and reward every role, never grind or a permanent miss, kept in a local, exportable profile. Replays and challenges are files (a save plus a command log plus checkpoints); a community leaderboard verified headless may come later, with no service now.

**Guardrails against a runaway economy and against not finishing:**

- Running costs scale with what the player owns (building upkeep, salaries, insurance), so income must keep pace with growth.
- Prices move by damped steps with per-tick caps; repeated identical sales and contracts saturate.
- Reputation decays toward a baseline.
- Every economy number has a projection (N days) and a cause on hover; the ledger is in the Mission Center.
- Economy multipliers are world rules; Sandbox turns the economy off.
- A headless **career bot** (a scripted player) runs 10 game years in a test; funds must stay inside a stated band and no single income source may exceed a stated share. A balance change that breaks the band fails the build.
- Delivery in thin slices: the ledger, costs and recovery first (plan 095), then one commodity and one production chain (plan 097), more only after the first is fun. If the full economy stalls, the currencies-and-running-costs core is a complete game on its own.

## Alternatives considered

- **Three currencies with running costs, resources later** (research recommendation) — not chosen; the owner wants production and markets in the first economy. Its core is kept as the first slice, so the recommendation is the fallback.
- **No money** (KSP2) — rejected: removes the cost of risk and reuse.
- **Building levels lock tools** (KSP1 maneuver nodes behind two upgrades) — rejected: the most disliked gate in the research.
- **Authored missions only** (KSP2) or **procedural only** (KSP1) — rejected: the owner chose both on one evaluator.
- **Online leaderboards and accounts** — rejected for now (ADR 0094 point 5).

## Consequences

- **Mod API:** `defineContract`, `defineMission`, `defineObjective` (primitives a mod adds), `defineStrategy`, `defineAchievement`, `defineCommodity`, `defineRecipe`; part and building costs as schema fields (additive). All patchable (ADR 0104).
- **Save format:** ledger, commodity stocks, prices, contracts, missions, milestones and the history book are world data (additive fields or bumps with migrations per plan). Achievements live in a local profile outside worlds (IndexedDB store `profile`).
- **Performance:** economy, contracts and markets run on the world tick inside its budget (ADR 0096); objective checks on events are O(active objectives).
- **UI:** costs in the Hangar (refs `Hangar.dc.html`), the ledger and contracts in the Mission Center and Administration, strategies in Administration.
- Follow-ups: plans 095 (economy core), 096 (buildings, levels, upkeep), 097 (markets, production), 098 (objectives), 099 (contracts), 100 (missions), 101 (strategies), 102 (milestones, achievements), 126 (agencies), 131 (replays, challenges).
