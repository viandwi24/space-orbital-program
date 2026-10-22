---
id: 371
title: "Rendezvous Fast mode: a direct intercept under a delta-v cap, with ETA and delta-v for both modes"
status: done
owner: "rendezvous session (Claude)"
depends: [331, 332]
phase: 0
created: 2026-10-22
updated: 2026-10-22
---

# 371 — Rendezvous Fast mode

## Goal

The owner asked for a fast rendezvous ("ga bisa ada mode fast kah biar mempercepat"). The Rendezvous tab offers **Efficient** (Hohmann and phasing, the least delta-v) or **Fast** (a direct intercept), with the ETA and delta-v of both before engaging.

## Scope

**In:** `fastIntercept` and `previewModes` in `mods/guidance/src/rendezvous.ts`, the mode and cap settings, a quicker close phase and fewer corrections in Fast, the tab, tests.
**Out:** multi-revolution intercepts (the Newton search does not converge reliably past one orbit).

## Acceptance criteria

- [x] `bun test mods/guidance`: target 50 km higher and 30° behind, cap 400 m/s: Fast holds after 2 022 s on 348 m/s; Efficient after 19 138 s on 88 m/s; both within 200 m and under 0.5 m/s.
- [x] `bun test mods/guidance`: the tab shows the mode, both previews and the cap field.

## Docs checklist

- [x] `docs/STATUS.md` board row.
- [x] `docs/journal/371-rendezvous-fast-mode.md`.
- [x] Guide: the Rendezvous modes.

## Log

- 2026-10-22 — Done. `bun test mods/guidance`: 36 pass.
