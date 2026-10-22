---
id: 366
title: "Trajectories helps instead of cluttering: when it shows, how it looks, its settings"
status: done
owner: "mod world API session (Claude)"
depends: [347]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 366 — Trajectories rework

## Goal

The Trajectories path appears only when it helps: never on the ground or the pad, not on a stable orbit, mainly on the way down through the air (re-entry, a falling stage, a landing), and always in the map once the path comes down to the ground. It is a thin, see-through arc coloured by heating that keeps clear of the vessel, with a labelled impact cross-hair. The player chooses where it shows, whether only while descending, and picks a landing target with a click on the map.

## Context

- Owner (2026-10-22): "masalah trajectory masih jelek sih, ini saya lagi mau terbangin rocket di launchpad eh trajectory linenya udah muncul jadi mengganggu aja gitu, jadi menurut saya pendekatan sekarang masih kurang membantu".
- Plan 347 (ADR 0296) built the mod; c36ba3df (the parts session) added a Show choice (falling or landing, always, off) in `trajectories.show`. This plan replaces that store and its rules. New **ADR 0307**.

## Scope

**In:** the visibility rules, the look, the panel settings (`trajectories.settings`), a `pick` panel node (map click), `mod-key` `data`, hidden keybindings, tests, a re-entry screenshot, API 0.1.108.
**Out:** thrust in the prediction; lift.

## Steps

1. ADR 0307; core: `pick` node, `MapPick`, `mod-key` `data`, `KeybindingDefinition.hidden`.
2. Mod: `visibility`, `arcPieces` (heat colours, 30 m clear, near fade), per-view shapes, settings store, map pick; tests.
3. Web: the pick tool (arm, open the map, take the next map click, Escape cancels); the node drawn as a button with its hint; tests.
4. Docs, screenshot, push.

## Acceptance criteria

- [x] `bun test mods/trajectories`: pad, ascent (fade 1–2 km, descending-only), orbit, re-entry, landed; the arc's pieces; the settings and a map pick through the sim.
- [x] web vitest: the pick node and the tool.
- [x] A screenshot of a re-entry arc in Flight.
- [x] `bun run typecheck`, `bun run docs:check` pass.

## Docs checklist

- [x] ADR 0307; guide (Trajectories, the `pick` node, `mod-key` data, hidden keys); STATUS; journal 366.

## Log

- 2026-10-22 — Started from c36ba3df.
- 2026-10-22 — Done. `bun test mods/trajectories packages/core/test`: 397 pass, 0 fail (the drop: 92 s over 78.4 km predicted, 91 s flown, 920 m off). Web vitest dock, mods, mod-keys, mod-overlays: 59 pass. svelte-check 0 errors; package typechecks clean; `bun run docs:check` OK. Renderer `overlay-layer.test.ts` passes after the label offset. Screenshots: `journal/assets/366-trajectories-reentry.png`, `366-trajectories-pad.png`.
