---
id: 316
title: "Hangar: a list of the vessel's parts, and how each part starts (panels open, lamps on) set and drawn there"
status: done
owner: "part visuals session (Claude)"
depends: [218, 315]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 316 — Part list and start state in the Hangar

## Goal

The owner (2026-10-21):
- the Hangar should list the parts on the vessel;
- as in KSP, some controls work in the Hangar: a solar array opened or closed there starts that way, without flying first.

## Context

- Plan 218 (ADR 0225): build controls write a part's `settings` in the design; the sim parses them over the config.
- Plan 315: `lib/editor/inside.ts`, the scene's module states.

## Scope

**In:**
- **Start controls** (`build`) for the solar panel (`deployed`), the landing legs (`deployed`), `stock.animate` and `stock.bay` (`open`) and the fuel cell (`running`). Lamps had theirs (plan 242). The configs already took these fields.
- **The Hangar draws every part from its start snapshot:** each module's `snapshot(state(config + settings))`, the same view the renderer reads in flight. A panel set to start open is drawn open, a lamp set on is lit. Plan 315's Open preview goes on top.
- **`PartList.svelte`:** the parts as a tree in the right panel (folded by default). A click selects, hover lights the part (and ghosts its shell), with tags for what a shell holds and for parts shown open.

**Out:** antennas (always on at launch; no start control).

## Acceptance criteria

- [x] `start-state.test.ts`: the five kinds have a start control; `startModules` follows the settings (a panel open, a lamp on).
- [x] `part-list.test.ts`: Kronos V's parts once each, the pod first, the lander inside the petals, children one level deeper.
- [x] Browser: Moonwatch Orbiter's solar wings selected from the list and set to start open are drawn open.

## Docs checklist

- [x] `docs/STATUS.md`, journal `316-hangar-part-list-and-start-state.md`.

## Log

- 2026-10-21 — Done on the owner's request.
