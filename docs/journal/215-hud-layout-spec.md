# 215 — HUD layout spec and stable camera framing

**Plan:** [plans/215-hud-layout-spec.md](../plans/215-hud-layout-spec.md) · **Session:** Worker B, 2026-10-19 · **ADRs:** [0205](../decisions/0205-vessel-panel-v2-part-inspector-hud-layout.md) points 5–7, 0107, 0140, 0144 · **Research:** `refs/reverse-engineering-ksp-ksp2/05-orbital-today-inventory.md` §4

## What was done

| Where | What |
|---|---|
| `lib/layout/regions.ts` | the region table and `layoutFor` (breakpoints at the width over the UI scale; one side panel below 1280, the last opened stays; drawers at 1024) |
| flight page | `narrow`/`drawer` classes from the rule instead of a 1279 px media query; staging, crew, maneuver editor and side column capped and scrolling; the capsule row wraps before the toolbar; vessel panel 340 px, dock 280 px; insets from the fixed bars only, eased, the "Centre the vessel in the free area" setting brings the sides back |
| renderer | `setViewInsets(insets, { animate })` eases over 250 ms (smoothstep) |
| tokens and text | `max(10px, …rem)` on the type tokens; the navball canvas follows the UI scale and its labels never go under 10 px; literal 11 px, colours and px of 05 §4.4 items 6 and 7 replaced with tokens (two new: `--code-select`, `--code-match`) |
| toasts | four at most; past it the oldest non-error leaves first |
| touch throttle | above the staging stack in the left column, or beside it |
| debug API | `toast(kind, title)`, `vesselOnScreen()` |
| tests | vitest `regions`, `tokens` (10 px floor at 0.8–1.5), toasts, layout-model, scene easing; e2e `hud-layout.e2e.ts` (three sizes, toasts, camera) |

## What surprised me

- **The camera move was all side insets:** the top and bottom insets come from bars that are always there, so zeroing the sides is enough; the e2e measures under 2 px of movement when the vessel panel opens and closes.
- **The touch throttle had nowhere to go** on a 1024 px tablet with the first-flight guide showing: the gap between the guide and the staging stack is shorter than its smallest track, so it moves beside the stack.
- **I overwrote `tokens.test.ts`** (the contrast tests) with the new floor test by mistake; restored from git and appended. The old test also had to accept `max(10px, …rem)` as rem.

## Screenshots

At 1440 × 900, 1280 × 800 and 1024 × 768, vessel panel open: `assets/215-flight-1440x900.jpg`, `assets/215-flight-1280x800.jpg`, `assets/215-flight-1024x768.jpg`.

## Decisions made (link ADRs)

- No new ADR; the choices the ADR leaves open are in the plan's Log (the 1280–1439 band, drawers, toast expiry).

## Open questions / follow-ups

- Plan 214: the vessel panel's resize handle within `REGIONS.vessel`; the inspector beside it.
- Dismissable error toasts and tooltip placement: plan 228.

## Verification output

```
(filled in at handover)
```
