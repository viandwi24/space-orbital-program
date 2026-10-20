---
id: 242
title: "Lights: a stock light part with on/off, colour and the lights group"
status: done
owner: "Worker A"
depends: [241]
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 242 — Lights: a stock light part with on/off, colour and the lights group

**Size:** M

## Goal

The stock pack has a light part (spot and floodlight) that the player can switch, colour and put in the lights action group (U).

## Context

- The release audit of 2026-10-20 (main @ 4281d931, read-only) found these items Partial or Missing against `refs/rancangan-terpadu.md`. The owner ordered plans for every missing feature at once ("Buatkan plan untuk semua fitur yang kurang sekarang", 2026-10-20). They do **not** block `v1.0.0` (plan 232); they form the v1.1 wave. File and line cites are from the audit; check them against current main when refining. Design: §4.2, §7.6b.
- The audit found no light module anywhere under `mods/` or `packages/` (§7.6b "Light: Missing"). The U key (lights group) exists in the KSP profile.

## Scope

**In:**

- A light module (on/off, colour, brightness, blink optional) and one or two light parts with a generator.
- A renderer light that is cheap: shadows off, a light budget per scene, culled when far.
- Membership in the lights group; EC use while on.

**Out:**

- Shadow-casting vessel lights.

## Touches

`mods/stock/src/parts/*`, a new `mods/stock/src/lights.ts`, `packages/renderer/src/parts/generators/*`, `packages/renderer/src/scene.ts` (light budget).

## Steps

1. Module and parts with a unit test (EC drain, group toggle).
2. Renderer light with a budget; a renderer test that the count stays under the budget.
3. Tech node and career cost (plan 231 style).
4. Chromium e2e: toggle lights with U at night.
5. Light checks locally, push `ready/242` for CI, and follow the worker brief (batch mode while it is in force).

## Acceptance criteria

- [x] A light part exists in the catalogue and its tech node.
- [x] U toggles it; EC drains while on; tests pass.
- [x] The renderer keeps the light count within its budget.
- [x] Affected unit tests pass (CI runs on main after the merge).
- [ ] The e2e of this plan passes on Chromium (e2e paused by the owner).

## Docs checklist

- [x] STATUS row, journal `docs/journal/242-light-part.md`, remove the matching Known-issues lines, any ADR written while refining.

## Log

- 2026-10-20 — Created by the coordinator from the release audit (owner order). Draft: the owner (Worker D) refines it against current main before claiming.
- 2026-10-20 — Worker A took it from Worker C's queue (coordinator's order). ADR 0239: `stock.light`, two radial parts on the Electrics node, `PartVisual.lamp`, an emissive lens and a pool of 4 spot lights. The plan said 'depends 241'; nothing here needed it. Unit tests only (e2e paused by the owner); the lens and the lights were not looked at in a browser.
