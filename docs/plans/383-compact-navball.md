---
id: 383
title: "A compact Flight navball module by default, with a Settings → Interface switch"
status: done
owner: "ui-v3 session (Claude, 2026-10-23)"
depends: [272]
phase: 7
created: 2026-10-23
updated: 2026-10-23
---

# 383 — Compact navball

## Goal

The owner's request of 2026-10-23: make the navball smaller and compact, with tighter gaps and smaller SAS buttons and mode buttons (prograde and the others).

## Context

- ADR 0319 (this plan's decision), ADR 0253 point 6 (the v3 navball module)
- `lib/hud/InstrumentDeck.svelte`: the whole module scales from `ballSize` (`--k = ballSize / 180`)

## Scope

**In:**
- **Compact by default.** The ball is 144 px on tall screens and 128 px on short ones; normal stays 180 and 144. Everything drawn in design units shrinks with it: gaps, the SAS and RCS pills, and the mode buttons (about 25 px).
- **Hit area.** The SAS mode buttons keep a hit area of at least 24 px.
- **Readouts.** The readouts wing gets the room up to the vertical-speed arc, because its labels and chips do not shrink.
- **Setting.** Settings → Interface → Compact navball (on by default).

**Out:**
- New icons; the mode icons are unchanged.

## Acceptance criteria

- [x] At 1920 × 1080 the module is 442 × 186 instead of 552 × 232 (−20 %), and the readouts and chips fit (screenshot).
- [x] At 1280 × 800 it is 393 × 165 instead of 442 × 186, as readable as before (the RAD chip was already cut there).
- [x] The switch turns the full size back on. svelte-check is clean, and the settings and HUD tests pass (one regions test fails because of the stock-planets work, not this change). e2e was not run.

## Docs checklist

- [x] `docs/STATUS.md`
- [x] ADR 0319 and its index row
- [x] Journal `383-compact-navball.md`

## Log

- 2026-10-23: Written from the owner's request (relayed by the main session) and done the same day.
