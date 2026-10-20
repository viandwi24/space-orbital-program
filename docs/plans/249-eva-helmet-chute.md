---
id: 249
title: "EVA: helmet on and off, a personal parachute"
status: done
owner: "Worker B"
depends: [245]
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 249 — EVA: helmet on and off, a personal parachute

**Size:** M

## Goal

A kerbal-style EVA has the helmet and personal chute the design lists.

## Context

- The release audit of 2026-10-20 (main @ 4281d931, read-only) found these items Partial or Missing against `refs/rancangan-terpadu.md`. The owner ordered plans for every missing feature at once ("Buatkan plan untuk semua fitur yang kurang sekarang", 2026-10-20). They do **not** block `v1.0.0` (plan 232); they form the v1.1 wave. File and line cites are from the audit; check them against current main when refining. Design: §9.1.
- §9.1 Partial: O (helmet) and P (personal chute) are missing (plan 225 Out); P is pause on every page, so the key needs a decision.

## Scope

**In:**

- Helmet toggle: allowed only in breathable air; the suit model shows it.
- Personal parachute: deploy and cut on EVA in an atmosphere, slows the kerbal to a safe landing speed.
- Keys in the KSP profile that do not clash with pause (ADR if P stays pause).

**Out:**

- Fall damage and suit lights (P1).

## Touches

`packages/sim/src/eva.ts`, `mods/stock/src/eva.ts`, `apps/web/src/lib/keybindings.ts`, `packages/renderer` suit model.

## Steps

1. ADR for the keys: [ADR 0237](../decisions/0237-eva-helmet-and-personal-parachute.md).
2. Sim and model with tests (chute drag, helmet rule).
3. Chromium e2e: EVA high above the ground, open the chute, land safely. (e2e paused by the owner, 2026-10-20: not run.)
4. Light checks locally, push `ready/249` for CI, and follow the worker brief (batch mode while it is in force).

## Acceptance criteria

- [x] Helmet toggles only in breathable air; the chute lands the kerbal below the safe speed; unit tests pass (sim, renderer, web). The e2e did not run (paused by the owner, 2026-10-20).
- [ ] CI is green on `ready/249`, and the e2e of this plan passes on Chromium (e2e paused by the owner, 2026-10-20).

## Docs checklist

- [x] STATUS row, journal `docs/journal/249-eva-helmet-chute.md`, remove the matching Known-issues lines, any ADR written while refining.

## Log

- 2026-10-20 — Created by the coordinator from the release audit (owner order). Draft: the owner (Worker E) refines it against current main before claiming.
- 2026-10-20 — Worker B claimed and implemented it: `atmosphere.breathable` (API 0.1.92), `stock.helmet`, the suit's `stock.parachute`, keys O and U, suit model, crew panel buttons. Unit tests only (e2e paused).
