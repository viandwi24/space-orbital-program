---
id: 243
title: "Fairings: interstage top node, enclosed-engine shielding, 3D section handles, a section at the cursor height"
status: done
owner: "Worker A"
depends: [238]
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 243 — Fairings: interstage top node, enclosed-engine shielding, 3D section handles, a section at the cursor height

**Size:** L

## Goal

Procedural fairings can enclose an engine between two stages, and their shape is edited in 3D.

## Context

- The release audit of 2026-10-20 (main @ 4281d931, read-only) found these items Partial or Missing against `refs/rancangan-terpadu.md`. The owner ordered plans for every missing feature at once ("Buatkan plan untuk semua fitur yang kurang sekarang", 2026-10-20). They do **not** block `v1.0.0` (plan 232); they form the v1.1 wave. File and line cites are from the audit; check them against current main when refining. Design: §8.9, §8b.7.
- 8b.7 Missing: no `interstage` anywhere (`rg -i interstage` over mods, packages and apps finds nothing); fairing bases at `mods/stock/src/parts/structure.ts:157-186` have only `stackNodes`. Deferred by plan 219 step 5 (ADR 0224).
- 8.9 Partial: a click adds a fixed 0.5 m section at the last radius (`apps/web/src/lib/vab/controller.svelte.ts:1302-1313`); no 3D drag handles; no section at the cursor's height; no cost on the status label.

## Scope

**In:**

- An interstage option on the fairing base: a top node at the shell's top that the next stage attaches to, and shielding of enclosed parts (drag and heat) until jettison.
- 3D handles for each section's radius and height; a click on the shell adds a section at the cursor height.
- The fairing cost on the status label.

**Out:**

- Cargo bays.

## Touches

`mods/stock/src/parts/structure.ts`, `mods/stock/src/fairing.ts`, `packages/sim/src` (shielding, staging of the top node), `packages/renderer/src/vab/*`, `apps/web/src/lib/vab/controller.svelte.ts`, `FairingEditor.svelte`.

## Steps

1. Refine; ADR for how the top node moves with the shell and what happens on jettison.
2. Sim: the top node and shielding with tests (drag and heat lower for enclosed parts).
3. Hangar: 3D handles and section-at-cursor; renderer unit tests for handle picking.
4. Chromium e2e: build a two-stage rocket with an interstage, fly, stage, the shell falls away.
5. Light checks locally, push `ready/243` for CI, and follow the worker brief (batch mode while it is in force).

## Acceptance criteria

- [x] An interstage fairing carries the upper stage on its top node and shields the engine; tests pass.
- [x] Sections are edited with 3D handles; a click adds a section at the cursor height.
- [ ] E2e passes (e2e paused by the owner).
- [x] CI is green on `ready/243`.

## Docs checklist

- [x] STATUS row, journal `docs/journal/243-interstage-fairings-handles.md`, remove the matching Known-issues lines, any ADR written while refining.

## Log

- 2026-10-20 — Created by the coordinator from the release audit (owner order). Draft: the owner (Worker A) refines it against current main before claiming.
- 2026-10-20 — Worker A: ADR 0238 (shell-top node via `effectiveDef`, open shielding shell, module `cost` hook, handles, section at the cursor). Unit tests only (e2e paused by the owner); the 3D handles were not tried in a browser.
