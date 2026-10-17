---
id: 106
title: "Crew core: roster, professions, traits, XP, seats"
status: draft
owner: ""
depends: [078, 082]
phase: 6
created: 2026-10-17
updated: 2026-10-17
---

# 106 — Crew core: roster, professions, traits, XP, seats

## Goal

A world has a crew roster: pilots, engineers, scientists and tourists with traits as data, XP booked on safe return, salaries and recruit costs (when the economy is on), seats in parts, death as a rule; crew abilities change quality only (never unlock a tool).

## Context

- ADRs: 0100
- Read: ADR 0100 points 1, 2 and the death rule, `refs/reverse-engineering-ksp2/08-crew.md` (git-ignored; never use KSP character names).

## Scope

**In:**
- `defineCrewTrait`; crew member data (name from a name generator, profession, traits, XP, status, location).
- Part `crewCapacity`; seat assignment at launch (`load-vessel` crew list) and transfer between parts.
- XP: new places × difficulty, booked on recovery.
- Abilities: pilot control smoothing and script budget factor; engineer repair (when reliability lands); scientist data quality factor.
- Death rule: permanent, return after N days, off.
- Salaries on the world tick.

**Out:** life support, morale, rest (107), screens (108), EVA (109).

## Touches

- **Size:** M
- **Edits:** `packages/core`, `packages/sdk`, `packages/sim`, `mods/stock`
- **Shared contracts:** **SDK (`defineCrewTrait`, `crewCapacity`), protocol (seats, transfer), save (roster)**

## Design notes

Names: a generator from syllable data in stock (patchable), seeded by the world.

## Steps

1. Schemas and roster.
2. Seats and transfer.
3. XP and abilities.
4. Death rule and salaries.

## Acceptance criteria

- [ ] `packages/sim` test: a crewed pod recovered after a moon flyby books XP for "flyby of <moon>" once per crew member.
- [ ] `packages/sim` test: with death `permanent`, a destroyed crewed part marks its crew lost; with `off`, they return to the roster.
- [ ] `packages/core` test: no ability key unlocks a flight tool (list asserted, ADR 0098).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/106-crew-core.md` written.
- [ ] `guides/writing-a-mod.md` (crew).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0100).
- 2026-10-17 — Defaults updated by ADR 0109: control needs a command source (crew aboard or linked probe), `controlWithoutSignal` none in Career/Science and full in Sandbox, Career crew presets standard + hardcore.
