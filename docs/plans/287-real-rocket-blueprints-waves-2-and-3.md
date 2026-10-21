---
id: 287
title: "Real-rocket blueprints waves 2 and 3: Timur-1, Pengiring-1, Neutron-M, Herkules V, Jalan Jauh 2F, Dioskuri, Lumière 5, Rajawali Berat, Stasiun Cakrawala, Penjelajah Selene, Ulang-Alik"
status: draft
owner: ""
depends: [286, 283, 284]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 287 — Real-rocket blueprints waves 2 and 3: Timur-1, Pengiring-1, Neutron-M, Herkules V, Jalan Jauh 2F, Dioskuri, Lumière 5, Rajawali Berat, Stasiun Cakrawala, Penjelajah Selene, Ulang-Alik

## Goal

The rest of the tracker §9 blueprints, including a station and a lunar rover, flown headless to their goals.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0263, 0255
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** Designs and tests; the shuttle-like Ulang-Alik needs orbiter wing parts: split into its own draft if they are not there.
**Out:** —

## Design notes

As 286.

## Steps

1. Wave 2: Timur-1, Pengiring-1, Neutron-M, Herkules V, Jalan Jauh 2F, Dioskuri.
2. Wave 3: Lumière 5, Rajawali Berat, Stasiun Cakrawala, Penjelajah Selene, Ulang-Alik.

## Acceptance criteria

- [ ] Each blueprint reaches its goal headless (`bun test`).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/287-real-rocket-blueprints-waves-2-and-3.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
