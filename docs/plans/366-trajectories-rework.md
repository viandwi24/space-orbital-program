---
id: 366
title: "Trajectories helps instead of cluttering: when it shows, how it looks, its settings"
status: in-progress
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

- [ ] `bun test mods/trajectories`: pad, ascent (fade 1–2 km, descending-only), orbit, re-entry, landed; the arc's pieces; the settings and a map pick through the sim.
- [ ] web vitest: the pick node and the tool.
- [ ] A screenshot of a re-entry arc in Flight.
- [ ] `bun run typecheck`, `bun run docs:check` pass.

## Docs checklist

- [ ] ADR 0307; guide (Trajectories, the `pick` node, `mod-key` data, hidden keys); STATUS; journal 366.

## Log

- 2026-10-22 — Started from c36ba3df.
