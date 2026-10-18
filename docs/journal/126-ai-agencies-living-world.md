# 126 — AI agencies and a living world

**Plan:** plans/126-ai-agencies-living-world.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-18), three-agent team mode · **ADRs:** [0190](../decisions/0190-ai-agencies-state-machines-owned-objects-rental-news.md) (new), [0096](../decisions/0096-world-tick-background-operations-and-a-living-world.md) point 4, [0098](../decisions/0098-progression-economy-career-and-milestones.md), [0188](../decisions/0188-comms-routing-pointing-capacity-latency-signal-delay.md) · **Research:** `refs/reverse-engineering-ksp2/beyond/03-world-and-economy-dynamics.md` (git-ignored); no new research note

**Status when written: criteria met here, handed over as `ready/126`.**

## What was done

| Where | What |
| --- | --- |
| `packages/core/src/agencies.ts` (new) | `AgencyDefinition`, `AgencyMission` and the schemas; `SaveAgencies`; `AgenciesSnapshot`; the constants (2 objects, 50 news items, 30-day contracts, the rent cause, the count rule) |
| `packages/core` | the `agencies` registry, `ctx.agencies`, report kind `agency`; `relay-rent` and `relay-end-rent`; `Snapshot.agencies`, `VesselSnapshot.owner`; `SimSave.agencies` (optional). `world.query` walks the smallest component and reuses its answer until membership changes. `API_VERSION` 0.1.70 (119 took 0.1.68, main is at 0.1.69) |
| `packages/sim/src/agencies.ts` (new) | the daily machine, `placeObject` (a probe core and dish on a circular orbit, on rails), `retire`, `offerReplacement`, rentals and their daily rent, `ownedRefusal`, `routable`, the snapshot |
| `packages/sim` | the tick after the economy; owned objects skip rails hooks, heat, rebasing, SOI checks, debris and milestones; commands for an owned vessel are refused; the comms network takes only the player's vessels and rented relays, and returns at once when it has none; save, init and the owner in the snapshot |
| `mods/stock` | six fictional agencies (Meridian Space Authority, Aurora Orbital, Kestrel Launch Works, Tidewater Aerospace, Halcyon Institute, Basalt Dynamics) with satellites at 900 to 1 600 km and relays at 1 800 to 3 000 km |
| `packages/sdk` | `defineAgency` and the types |
| `apps/web` | `mission-center/agencies-model.ts`; Rivals and News panels in the Mission Center |
| tests | `packages/sim/test/agencies.test.ts` (4); the base career bot asserts three agencies within their caps; web `agencies-model.test.ts` (2); the SDK loader's report kinds |
| docs | ADR 0190; `simulation.md` gains "Rival agencies"; `plugin-system.md`; the mod guide; the glossary |

## Decisions and deviations

- **Passive objects, two per agency.**
  - **The first runs:** with objects as ordinary rails vessels, the ten-year career bot took over 300 s. Every 10 s rails chunk did every per-vessel step for each object.
  - **The changes:**
    - owned objects skip the steps that cannot change them;
    - the comms network leaves them out unless rented;
    - an empty network returns at once;
    - the ECS query reuses its answer.
  - **The result:** 28 to 30 s with two objects per agency, faster than the 32 s before agencies. Four objects each took 37.9 s, too close to the 45 s limit in a full run.
- **Agency objects counted for the player.** They have a control source, so `collectMilestones` counted their orbits as the player's milestones. A rival satellite placed after an altitude contract was accepted also finished that contract (caught by `check:affected` in the contracts test). Owned vessels are now left out of milestones and out of the objectives view.
- **Rent is a fixed price per relay**, not a capacity commodity on the 097 markets. Markets trade goods, and services would need a market of their own.
- **Mod agencies run in registration order** within `stock.agency-count`. A mod's agency needs to boot before stock or a higher count. A world rule naming agencies is a follow-up.
- **No rent button in the page yet.** The commands are there, and the Mission Center shows rivals and news. Renting from the vessel card is a follow-up.
- **World firsts by agencies, market reactions, customer requests** are follow-ups (ADR 0190).

## Measurements

- **Seed 11:** Meridian's first relay flies on the same day in both runs, and appears on rails with `owner: stock.meridian`.
- **Rental:** with Meridian's relay 20° to 60° from the station, a probe 150 km up and 50° from the station on the relay's side routes `vessel:<relay> → station` while rented, and has no route when not. The rent books −400 funds a day to Meridian.
- **Career bot,** 3 600 days with three agencies: funds 82 009 to 196 573, unchanged by the agencies (the bot rents nothing); 28.3 s.

## Follow-ups

- A rent button on the Mission Center card for an agency relay.
- World firsts claimed by agencies.
- Market reactions; customer-request contracts.
- A world rule that names the agencies.

## Verification output

```text
bun run check:affected        prettier, docs:check, typecheck (11 workspaces + web) pass;
                              bun test of 10 workspaces: 1627 pass, 2 fail — the patch benchmark (load)
                              and the contracts deadline test, which showed a rival satellite finishing
                              the player's contract (fixed: owned vessels are out of the objectives view)
bun test packages/sim/test/contracts.test.ts packages/sim/test/objectives.test.ts
         packages/sim/test/agencies.test.ts                     19 pass after the fix
bun test packages/sim/test/career-bot.test.ts -t "only launches"   1 pass, 28.3 s
full suite                    CI on the ready/126 commit (ADR 0126)
```
