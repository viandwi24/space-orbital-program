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

- ADRs: 0094, 0104
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

- [ ] `packages/sdk` test: a mod defines a rule and a preset; the load report lists them.
- [ ] `packages/sim` test: `set-rule` on a changeable rule changes it at the next step and adds one changelog entry; on `gravityModel` it is refused with reason `identity rule`.
- [ ] `packages/sim` resume test: a save after a rule change resumes with the same value and changelog.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/078-world-rules-presets-and-changelog.md` written.
- [ ] `docs/architecture/plugin-system.md`, `guides/writing-a-mod.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0094, 0104).
- 2026-10-17 — Defaults updated by ADR 0109: control needs a command source (crew aboard or linked probe), `controlWithoutSignal` none in Career/Science and full in Sandbox, Career crew presets standard + hardcore.
