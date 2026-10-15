---
id: 006
title: Stock mod, minimal
status: draft
owner: ""
depends: [005]
phase: 0
created: 2026-10-16
updated: 2026-10-16
---

# 006 — Stock mod, minimal

## Goal

`mods/stock` registers, through `@orbital/sdk` only, everything needed to reach orbit: resources (liquid fuel, oxidizer, electric charge), modules (command, resource container, engine, decoupler, reaction wheel), 5–6 parts, and one home body ("Kerbin-scale", see product spec). It boots through the loader and is the reference example for modders.

## Context

- Read: `docs/architecture/plugin-system.md` (as updated by 005), `product/spec.md` §4, `glossary.md`.
- ADRs: 0005, 0007.

## Scope

**In:** definitions + loader boot test + a `docs/guides/writing-a-mod.md` first draft generated from stock as the example.
**Out:** meshes/art (placeholders: part dimensions only; renderer draws boxes/cylinders until art exists), balance tuning.

## Design notes

- Numbers in SI; use SDK helpers for readability.
- Part set: `command-pod` (mass 840 kg, holds 50 EC), `tank-small` (dry 250 kg, 400 LF + 490 OX), `tank-medium`, `engine-lv` (thrust 215 kN, Isp 300/280 s), `decoupler`, `reaction-wheel`.
- Home body: radius 600 km, μ = 3.5316e12, rotation period 21 600 s, atmosphere height 70 km, scale height 5.6 km, surface pressure 101 325 Pa. (Classic KSP-like numbers; they make a quick ascent possible. Record as ADR if changed.)

## Steps

1. `mods/stock/src/{resources,modules,parts,bodies}.ts`, `src/index.ts` as `definePlugin`.
2. Test: loader boots stock → report lists all ids; every part's module configs validate; `ctx` typing works for a test plugin depending on stock.
3. `docs/guides/writing-a-mod.md` draft.
4. Journal.

## Acceptance criteria

- [ ] `bun test mods/stock` passes: boot report contains exactly the expected ids (list them in the test).
- [ ] `grep -rn "@orbital/core\|@orbital/sim\|@orbital/physics" mods/stock/src` returns nothing.
- [ ] `bun run typecheck`, `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md`, journal, `docs/guides/writing-a-mod.md`, ADR for body numbers if they differ from above.

## Log

- 2026-10-16 — Created as draft.
