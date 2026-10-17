---
id: 106
title: "Crew core: roster, professions, traits, XP, seats"
status: done
owner: "Agent 3"
depends: [078, 082]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 106 — Crew core: roster, professions, traits, XP, seats

## Goal

A world has a crew roster: pilots, engineers, scientists and tourists with traits as data, XP booked on safe return, salaries and recruit costs (when the economy is on), seats in parts, death as a rule; crew abilities change quality only (never unlock a tool).

## Context

- ADRs: 0100 points 1 to 3, 0109 (control needs a command source; Career presets), 0098 point 3 (abilities never unlock tools), 0113 (ledger), 0171 (world tick, streams), 0176 (written in step 1: roster, places and XP, seats, death, salaries, control).
- Read: `refs/reverse-engineering-ksp2/08-crew.md` (never use KSP character names), the crew rules in `mods/stock/src/rules.ts` (078: experience, salaries, death, return days), `packages/sim/src/economy.ts` (`record`, recovery), `destroyVessel` in `packages/sim/src/vessel.ts`, `loadVessel` in `packages/sim/src/commands.ts`, `partDefinitionSchema`.

## Scope

**In:**
- `defineCrewTrait({ id, label, abilities })` (abilities: factors on quality keys only) and `defineCrewNames({ id, first, last })` (syllable data; stock ships one set). A crew member: `{ id, name, profession: pilot | engineer | scientist | tourist, traits, xp, level, status: available | assigned | missing | lost, location?, returnsAt?, places, visited, log }`. The roster is empty until `crew-hire { profession }` (name and traits from the world's `crew` PRNG stream, ADR 0171; recruit cost when economy and salaries are on).
- Part `crewCapacity` (stock command pod: 1). `load-vessel` takes `crew: [{ member, part }]` (design part index; capacity checked); `crew-transfer { vessel, member, to }` between parts of one vessel.
- Places: while aboard, a member collects `flyby:<body>` (in a sphere other than home), `orbit:<body>` (closed orbit clear of the body's atmosphere and surface) and `landed:<body>` (not home). At recovery (`recover-vessel`) each place not yet in `visited` books XP = kind (flyby 1, orbit 1.5, landed 2.3) × body (home 1, other bodies 2) when the experience rule is on; `level` from thresholds 2, 8, 16, 32, 64. Then the member is `available` again.
- Abilities (`abilitiesOf(member, traits)`): quality factors `controlSmoothing`, `scriptBudget` (pilot), `repairRate` (engineer), `dataQuality` (scientist), `gTolerance`, `panicResistance` (traits), shown per vessel in `VesselSnapshot.crew`. Their consumers come with 107, 111, 103 and 130; a core test asserts that no ability key names a flight tool.
- Death (`stock.crew-death`): a vessel destroyed (any reason but recovery) with crew aboard: `permanent` → `lost`; `return` → `missing` until `stock.crew-return-days` days later (back on a world tick); `off` → `available`.
- Salaries: on each world tick, when economy and salaries are on, each hired member who is not lost costs a daily salary (profession base × (1 + 0.25 × level)), one ledger entry per tick.
- `Snapshot.crew` (the roster) and `VesselSnapshot.crew` (who sits where, abilities); `SimSave.crew` optional in format 5, written once anyone is hired.
- Control: ADR 0109's "crewed command parts need crew aboard" is not enforced here; it belongs to the control states of plan 114 together with probe links. Crewed command parts stay controllable, as today.

**Out:** life support, morale, rest (107), screens (108), EVA (109); applying abilities to control, scripts, data and repair (107, 111, 103, 130); the command-source rule (114); a soft landing at home in tests (stock has no parachute yet).

## Touches

- **Size:** M
- **Edits:** `packages/core` (`crew.ts` new, `schemas.ts` `crewCapacity`, `registry.ts`, `plugin.ts`, `definitions.ts`, `protocol.ts`, `protocol-schemas.ts`, `events.ts`, `save.ts`, `version.ts`, `index.ts`), `packages/sdk`, `packages/sim` (`crew.ts` new, `core.ts`, `sim.ts`, `commands.ts`, `vessel.ts`, `snapshot.ts`, `save.ts`, tests), `mods/stock` (traits, names, pod capacity, tests), `docs/architecture/simulation.md`, `docs/architecture/plugin-system.md`, `docs/guides/writing-a-mod.md`
- **Shared contracts:** **SDK (`defineCrewTrait`, `defineCrewNames`, `crewCapacity`; `API_VERSION` patch bump), protocol (`crew-hire`, `crew-transfer`, `load-vessel` `crew`, events, `Snapshot.crew`, `VesselSnapshot.crew`), save (optional `SimSave.crew`), load report kinds `crew-trait`, `crew-names`**

## Design notes

Names: a generator from syllable data in stock (patchable), seeded by the world.

## Steps

1. ADR 0176; types, schemas, registries, `abilitiesOf`, the name generator; stock traits and names; core tests.
2. Sim roster and `crew-hire`; seats at load and `crew-transfer`; snapshot and save.
3. Places and XP at recovery.
4. Death rule, return days and salaries on the world tick.

## Acceptance criteria

- [ ] `bun test packages/sim/test/crew.test.ts`: a crewed pod on a transfer orbit records `flyby:stock.cinder` for its crew when it enters the moon's sphere on rails; a crewed pod at rest on the moon, recovered, books XP for `flyby:stock.cinder` and `landed:stock.cinder` once per crew member, and a second recovery of the same member there books nothing new.
- [ ] Same file: with death `permanent` a crewed pod destroyed by impact marks its crew `lost`; with `off` they are `available`; with `return` they are `missing` and come back on the tick after the set days.
- [ ] Same file: seats respect `crewCapacity`; `crew-transfer` moves a member; salaries are one ledger entry per tick when economy and salaries are on; a hire is deterministic from the world seed.
- [ ] `bun test packages/core/test/crew.test.ts`: no ability key names a flight tool (the tool list is asserted: `sas`, `maneuver-nodes`, `map`, `target`, `scripts`, `staging`, `time-warp`, `trajectory`); `abilitiesOf` combines profession, level and traits.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/106-crew-core.md` written.
- [ ] `guides/writing-a-mod.md` (crew).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0100).
- 2026-10-17 — Defaults updated by ADR 0109: control needs a command source (crew aboard or linked probe), `controlWithoutSignal` none in Career/Science and full in Sandbox, Career crew presets standard + hardcore.
- 2026-10-17 — Refined and claimed by Agent 3. The XP criterion was reworded: stock has no parachute, so a soft landing at home cannot be flown in a test. Recording on the moon flyby and booking at a recovery on the moon (which 095 allows, at credit 0) exercise the same code. ADR 0109's "crew needed for control" is left to plan 114's control states, so existing designs without crew stay controllable. The roster starts empty and is filled with `crew-hire`, so saves and snapshots of runs without crew are unchanged. Design choices go in ADR 0176.
- 2026-10-17 — Implemented as refined. The tests switch on `stock.crew-experience` and the salary rules, which the Legacy (Sandbox) world has off.
- 2026-10-17 — Rebased after the 090 merge (registries, plugin, protocol, sim commands and snapshot: both sides kept). 090 took `API_VERSION` 0.1.36, so 106 is 0.1.37.
- 2026-10-17 — Handed over as `ready/106`; the handover text is the tag message.
- 2026-10-17 — Merge by Agent 1 (M5): rebased on `main` @ 76bf4ac after 098 (list-tail conflicts in registries, kinds, report, commands, schemas, snapshot types, save, sim core, step hooks and docs: both sides kept; crew places are collected before objectives are evaluated); `API_VERSION` 0.1.38 (098 took 0.1.37; guide and plugin-system headings say 0.1.38). `bun run test` 1469 pass, 0 fail · web vitest 105 files, 915 passed · typecheck exit 0 · build exit 0 · docs:check OK · Chromium smoke 6 passed (2.4m).
