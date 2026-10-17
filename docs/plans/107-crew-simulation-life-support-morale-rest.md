---
id: 107
title: "Crew simulation: life support, morale, rest, g-load"
status: in-progress
owner: "Agent 3"
depends: [106]
phase: 6
created: 2026-10-17
updated: 2026-10-18
---

# 107 — Crew simulation: life support, morale, rest, g-load

## Goal

Crew consume oxygen, water and food and produce CO2 handled by parts; morale and fatigue change with mission length, crowding, events and rest; g-load and radiation exposure count; each aspect is a world rule with levels (off, simple, full) and presets (Sandbox off, Science simple, Career full); shortages are predicted and shown before they happen.

## Context

- ADRs: 0100
- Read: ADR 0100 points 3 and 4, ADR 0096 (background closed forms).

## Scope

**In:**
- Consumables as resources (supplies for `simple`; oxygen, water and food for `full`), CO2 scrubbing by modules with a `scrubber` hook; stock life-support pack and scrubber parts.
- Exact piecewise-linear consumption after every flight step and rails chunk (warp included); shortages dated exactly, a grace per consumable, then the death rule.
- Morale and fatigue (documented formulas, ADR 0181) scaling the reported quality factors; g-load blackouts from the proper acceleration and `gTolerance`; radiation dose recorded.
- Prediction: `VesselSnapshot.lifeSupport` with time left per consumable; the crew card shows it and the causes.
- Rules already wired to presets (078/109): `stock.life-support`, `stock.crew-morale`, `stock.crew-rest`, `stock.crew-exposure`.

**Out:** EVA (109), seating crew at launch (108), radiation limits and illness (later).

## Touches

- **Size:** L
- **Edits:** `packages/sim`, `mods/stock`, `packages/sdk`, `apps/web/src/lib/hud`
- **Shared contracts:** **SDK (module `scrubber` hook, life-support constants), protocol (`VesselSnapshot.lifeSupport`, crew condition, events), save (optional member fields in `SimSave.crew`)**

## Design notes

Every effect has a visible cause in the crew card.

## Steps

1. ADR 0181; core constants and types; stock resources and parts.
2. Life support pass, shortages, grace and death; prediction.
3. Morale, fatigue, g-load, radiation.
4. Snapshot, save fields, crew card.

## Acceptance criteria

- [ ] `bun test packages/sim/test/life-support.test.ts`: a 3-crew cabin with N days of supplies reports a time left within 1 % of `N × day / 3`, and `crew:shortage` comes at that time, at warp 1 and at warp 1e5.
- [ ] Same file: with life support `off` nothing is consumed; with `full`, too few scrubbers give a `co2` shortage.
- [ ] Same file: a save taken mid-shortage resumes with the same `since`, and the member is lost at `since + grace`.
- [ ] Same file: morale and fatigue follow the stated closed forms; a hard burn above the tolerance gives `crew:g-loc`.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/107-crew-simulation-life-support-morale-rest.md` written.
- [ ] `architecture/simulation.md`, `guides/writing-a-mod.md` (scrubbers, consumables).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0100).
- 2026-10-17 — Defaults updated by ADR 0109: control needs a command source (crew aboard or linked probe), `controlWithoutSignal` none in Career/Science and full in Sandbox, Career crew presets standard + hardcore.
- 2026-10-18 — Refined and claimed by Agent 3. The rules and presets already exist (078/109). Consumption is exact piecewise-linear integration, not per-step, so warp dates a run-out correctly. CO2 is a scrubbing check, not a stored gas. The stock pod is unchanged, because the launch flow seats nobody until 108. Design choices go in ADR 0181.
