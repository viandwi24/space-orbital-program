---
id: 051
title: "Mod-supplied part visuals and assets"
status: draft
owner: ""
depends: [046]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 051 — Mod-supplied part visuals and assets

## Goal

A mod can give its parts geometry the game does not already have: a new generator kind or a glTF model shipped inside the package, so a mod part is not limited to the stock generators with another palette.

## Context

- Split out of plan 046 (ADR 0057 point 5): the sample mod's parts use `visual.kind: 'tank'` with their own palette and params. `registerPartGenerator` (`packages/renderer/src/parts/registry.ts`) is renderer code, and a package carries only code that runs in the sim Worker and the page's catalogue, not in the renderer; ADR 0047 loads glTF from URLs (`GltfPartProvider`).

## Scope

**In (to be ordered at refinement):** a package may carry assets (data URLs or a second file in the envelope) that `GltfPartProvider` resolves; or a declarative geometry description (lathe profile, boxes) validated by a schema so no renderer code is needed; the trust prompt lists what a package ships.
**Out:** a hosted repository, executable renderer hooks (a mod running code in the render loop).

## Acceptance criteria

- [ ] To be made measurable at refinement.

## Docs checklist

- [ ] STATUS, journal, ADR, `writing-a-mod.md`.

## Log

- 2026-10-17 — Created as draft by plan 046 (found, not done).
