---
id: 053
title: "Remappable keys, audio and small screens"
status: draft
owner: ""
depends: [023]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 053 — Remappable keys, audio and small screens

## Goal

What plan 023 stated honestly instead of faking in 1.0: players can choose their own keys, hear the game, and play on a tablet or phone-sized screen.

## Context

- Plan 023 and ADR 0060: the key list (`lib/keybindings.ts`) is read-only and the settings dialog has a disabled audio row; ADR 0040: phones and tablets are not supported (layout from 1280x720, no touch input).

## Scope

**In (candidates, to be ordered at refinement):**

1. **Remappable keys:** the handlers in `flight-loop.ts` and `vab/controller.svelte.ts` read a binding table (from `keybindings.ts`) instead of `switch` statements; the settings dialog edits it, warns on a clash, resets to defaults, persists in `orbital.settings` (format version 2).
2. **Audio:** engine, staging, ambient and UI sounds with the Web Audio API, a master/effects/music volume in the settings, muted until the first user gesture, `prefers-reduced-motion` unaffected. Needs audio assets (a licence decision per file).
3. **Small screens:** a touch input scheme (virtual throttle, steering and stage buttons), a layout below 1280 px, a test on real devices or emulators (the browser matrix of ADR 0040 grows a mobile row).

**Out:** gamepad support, accessibility audit by a person (needs a human).

## Steps

1. Refine when the human decides the order; each candidate may become its own plan.

## Acceptance criteria

- [ ] To be written when refined.

## Docs checklist

- [ ] `STATUS.md`, journal, `product/browser-support.md`, ADR for the binding table format.

## Log

- 2026-10-17 — Created as draft by plan 023 (release session): the public roadmap page lists it.
