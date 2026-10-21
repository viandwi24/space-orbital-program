---
id: 313
title: "Tethers and winches between vessels, and releasable struts"
status: draft
owner: ""
depends: [306]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 313 — Tethers, winches, strut release

## Goal

A winch reels a rope to another vessel (a rover to its lander, cargo to a station, a harpoon into an asteroid), and a strut can be released in flight.

## Context

- ADR 0272 (proposed), research `refs/part-visuals-and-blueprints/connectors-and-tethers.md`.
- ADR 0071 (connectors), ADR 0265 (Rapier joint measurements).

## Scope

**In:** strut release; `tether` hook; Rapier rope joint in the physics adapter and the mock; winch S/M, socket, hook, harpoon parts; rope rendering; save; tests.
**Out:** fuel hoses between vessels (a later plan: a tether with `feeds`).

## Steps

1. Strut release action.
2. Physics adapter: rope joint, length, removal; mock backend.
3. Sim: tether lifecycle, snap, save, rails.
4. Parts and the rope's drawing.

## Acceptance criteria

- [ ] Sim test: a lander's winch reels a 1 t rover up 10 m under gravity.
- [ ] Sim test: the tether snaps above its strength, and both vessels keep their velocities on attach and release.
- [ ] Save and load keep a tether and its length.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/313-tethers-winches-and-strut-release.md` written.
- [ ] ADR 0272 accepted or amended.

## Log

- 2026-10-21 — Drafted from the owner's question about KSP's cables and struts.
