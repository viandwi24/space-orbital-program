---
id: 078
title: "World rules, presets and the rule changelog"
status: in-progress
owner: "Agent 1"
depends: [077]
phase: 4
created: 2026-10-17
updated: 2026-10-17
---

# 078 — World rules, presets and the rule changelog

## Goal

`defineRule` and `definePreset` exist in the SDK; stock registers the rules the foundation needs (with defaults per Sandbox, Science and Career) and the three presets; a world's rule values live in the sim world; changeable rules change mid-game through a `set-rule` command that appends to the world's changelog.

## Context

- ADRs: 0094, 0104, 0111
- Read: ADR 0094 point 3 and 4, ADR 0013 (define API), `packages/sdk`, `mods/stock/src/index.ts`.
- Rule list to register (values from ADRs 0095 to 0101): economy, science depth, tech tree, crew aspects, crew death, signal delay, control without signal, comms scale, range safety, reliability, agency type, agency count. Rules whose system is not built yet are registered but inert.

## Scope

**In:**
- `defineRule({ id, type, default, presets, category, changeable })` and `definePreset({ id, label, values })` with zod schemas.
- Rule values validated against their type; unknown rule ids from a missing mod are kept and reported.
- `set-rule` command (validated, refused for identity rules with a reason) and `world:rule-changed` event; changelog entries `{ time, rule, from, to }`.
- Snapshot: the rule values the HUD needs.

**Out:** the Create World UI (087); systems behind the rules.

## Touches

- **Size:** M
- **Edits:** `packages/core`, `packages/sdk`, `packages/sim`, `mods/stock`, `docs/guides/writing-a-mod.md`
- **Shared contracts:** **SDK (`defineRule`, `definePreset`), protocol (`set-rule`, event), save (rule values)**

## Design notes

A rule's value lookup is a plain map read; no per-step cost. Identity rules: system, variant, gravity model, seed, primary site.

## Steps

1. SDK schemas and registries.
2. Stock rules and presets.
3. Command, event, changelog; resume test with a changed rule.
4. Guide section.

## Acceptance criteria

- [x] `packages/sdk` test: a mod defines a rule and a preset; the load report lists them.
- [x] `packages/sim` test: `set-rule` on a changeable rule changes it at the next step and adds one changelog entry; on `gravityModel` it is refused with reason `identity rule`.
- [x] `packages/sim` resume test: a save after a rule change resumes with the same value and changelog.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/078-world-rules-presets-and-changelog.md` written.
- [x] `docs/architecture/plugin-system.md`, `guides/writing-a-mod.md`.
- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0094, 0104).
- 2026-10-17 — Defaults updated by ADR 0109: control needs a command source (crew aboard or linked probe), `controlWithoutSignal` none in Career/Science and full in Sandbox, Career crew presets standard + hardcore.
- 2026-10-17 — Claimed by Agent 1 (Lead, M5) on `lead/078-world-rules`. ADR 0111 written first: values resolved once and stored in `WorldInfo.rules`, with `preset` and `changelog` added to the world info (additive in format 5; `readSimSave` now signs every result), `set-rule` written at dispatch, `SystemContext.rules`, `Snapshot.rules`. `API_VERSION` 0.1.27. Contracts (all in Touches): SDK `defineRule`/`definePreset` and registries, protocol `set-rule` and `world:rule-changed`, save (rule values, preset, changelog). Also edited inside those contracts: `apps/web/src/lib/save/world-record.ts` (uses core's `RuleChange`).
- 2026-10-17 — Acceptance, on the M5:
  - SDK: `bun test packages/sdk/test/rules.test.ts` — `3 pass, 0 fail` ("a mod defines a rule and a preset; the load report lists them, by plugin").
  - Sim: `bun test packages/sim/test/rules.test.ts` — `7 pass, 0 fail`: `set-rule` changes `stock.economy` from the next step with one changelog entry and one event; `gravityModel` (and `seed`, `stock.agency-type`) refused with reason `identity rule`; a save after two changes resumes byte for byte with the same values and changelog.
  - `bun run test` — `1353 pass, 0 fail` · web vitest — `93 passed`, `827 passed` · `bun run typecheck` — exit 0 · `bun run build` — exit 0 · `bun run docs:check` — `OK (129 plans, 111 ADRs)` · Chromium smoke — `6 passed (2.5m)`.
  - Resources: swap rose to 4.3 GB during the smoke run (stop condition > 4 GB); memory free stayed 60 %. Nothing left running.
