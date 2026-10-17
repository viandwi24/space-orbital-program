# 0176 — Crew core: roster, places and XP, seats, death and salaries

**Status:** accepted
**Date:** 2026-10-17
**Plan:** 106
**Builds on:** ADR 0100 points 1 to 3 (crew per world, abilities as quality, the death rule), 0109 (control needs a command source; Career presets), 0098 point 3 (abilities never unlock tools), 0113 (ledger), 0171 (world tick, PRNG streams), 0110 (state beside the ECS world).

## Context

ADR 0100 fixes what a crew member is, and ADR 0109 adds that control needs crew aboard. Open: where the roster lives, how a name is made, what a "new place" is and when XP is booked, what abilities are as data, what the death rule does at the moment of loss, and whether plan 106 enforces ADR 0109's control rule.

## Decision

1. **Roster beside the world.** `SimSave.crew = { next, members }` is optional in format 5, like economy and objectives. It is written once anyone is hired, so runs without crew keep their saves and snapshots.
2. **Hiring.** `crew-hire { profession }` adds a member with the id `c<n>`. The name comes from registered `defineCrewNames({ id, first, last })` syllable lists, and one or two traits from the registered `defineCrewTrait`s. All draws use the world's `crew` stream (`streamSeed(seed, 'crew')`, ADR 0171), saved as its state. The same world hires the same people in the same order. A recruit cost is booked when the economy and salary rules are on. The roster starts empty: the screens of plan 108 hire the first crew.
3. **Seats.** A part declares `crewCapacity`. `load-vessel` takes `crew: [{ member, part }]` with design part indices. Members must be `available`, and a part may not hold more than its capacity. `crew-transfer { vessel, member, to }` moves a member between parts of one vessel. A member's `location` is `{ vessel, part }`, and staging keeps it right because the part entity does not change.
4. **Places.** At the end of each step, every member aboard collects places into `places`: `flyby:<body>` in any sphere but home's, `orbit:<body>` on a closed orbit whose periapsis clears the atmosphere (or the surface), and `landed:<body>` landed on any body but home.
5. **XP at recovery.** At `recover-vessel`, with `stock.crew-experience` on, each place not in `visited` books `kind × body` XP: flyby 1, orbit 1.5, landed 2.3; home ×1, any other body ×2. It is logged, added to `visited`, and the level follows the thresholds 2, 8, 16, 32 and 64. The member is then `available`, and `places` is cleared. Recovery is allowed anywhere (plan 095), so a crew landed on the moon can be recovered there. Places of a vessel that is never recovered are never booked.
6. **Abilities are quality factors.** `abilitiesOf(member, traits)` returns factors on the keys `controlSmoothing`, `scriptBudget` (pilot), `repairRate` (engineer), `dataQuality` (scientist), `gTolerance` and `panicResistance` (traits). Profession and level give a base, and traits multiply it. A trait's `abilities` may name only these keys. A core test asserts that no key names a flight tool (`sas`, `maneuver-nodes`, `map`, `target`, `scripts`, `staging`, `time-warp`, `trajectory`). The consumers (control, scripts, science, repair, g-load) apply them in their own plans.
7. **Death at loss.** When a vessel is destroyed for any reason other than recovery, its crew follow `stock.crew-death`: `permanent` → `lost`; `return` → `missing`, with `returnsAt` = now + `stock.crew-return-days` days, and back to `available` on the first world tick after that; `off` → `available` at once.
8. **Salaries.** On each world tick, with economy and salaries on, the hired members who are not `lost` cost their daily salary: pilot 400, engineer 400, scientist 450, tourist 0 funds, × (1 + 0.25 × level). This is one ledger entry per tick (`crew.salaries`), and recruiting costs 20 days of the base.
9. **Control is unchanged here.** ADR 0109's "a crewed command part needs crew aboard" arrives with plan 114's control states, together with probe links. Until then crewed command parts stay controllable without crew, so no existing design or test changes behaviour.

## Alternatives considered

- **A starting roster in every world** — rejected: every snapshot and save would change, and the starting crew is a Create World choice (108).
- **XP on the event itself** (KSP books at recovery) — rejected: ADR 0100 says XP is booked on a safe return.
- **Enforce the command-source rule now** — deferred to 114: without probe links, every probe design and almost every test would become uncontrollable.

## Consequences

- **Mod API:** `defineCrewTrait`, `defineCrewNames`, `crewCapacity`, crew types and `abilitiesOf`; additive, `API_VERSION` patch bump. Load report kinds `crew-trait` and `crew-names`.
- **Protocol:** `crew-hire`, `crew-transfer`, `load-vessel` `crew`, events `crew:hired`, `crew:xp`, `crew:lost`, `crew:returned`, `Snapshot.crew`, `VesselSnapshot.crew`. **Save:** optional field.
