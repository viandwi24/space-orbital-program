# 0307 — Trajectories shows when it helps; panels pick points on the map

**Status:** accepted (owner's feedback, 2026-10-22); the Trajectories mod's parts are superseded by ADR 0309 (it moved into the Guidance Computer); the map pick stays
**Date:** 2026-10-22
**Plan:** plans/366-trajectories-rework.md
**Amends:** ADR 0296 point 7 (Trajectories), ADR 0292 point 6 (keys), ADR 0149 (panel nodes)

## Context

The owner found the path in the way: it showed on the pad before liftoff and through every climb. A path matters where the vessel comes down through the air; on the ground there is nothing to predict, on a stable orbit the map's orbit line already says it, and on the way up the prediction (no engines) only says "back to the pad". A landing target was set only at the predicted impact, not where the player wants to land.

## Decision

1. **When.** Nothing for a vessel on the ground, on the pad or splashed, on a stable orbit or escaping, or whose path does not reach the ground. In Flight the arc fades in from 1 to 2 km above the ground; in the map it shows whenever the path comes down to the ground. Settings (store `trajectories.settings`): `show` `off` | `map` | `both` (default `both`) and `descendingOnly` (default false: shown on a suborbital climb too, faded in by height).
2. **Look.** Width 2 px, 80 % opacity, in at most ten pieces coloured by the heating √ρ·v³ (green, yellow, orange, red); nothing within 30 m of the vessel, and faint over its first 600 m so it does not run through the camera. The impact cross-hair carries "time · distance"; a target carries its error.
3. **Map pick: a `pick` panel node.** `{ kind: 'pick', label, hint?, enabled?, command(input, { body, direction }) }`: pressing it arms a pick and opens the map; the next map click on a body runs `command` with the body-fixed unit direction; a click off every body, Escape or a second press cancels.
4. **`mod-key` carries `data`** (at most 16 numbers, strings or booleans), passed on in `mod:key`; and a keybinding may be `hidden` (a panel's own key, not listed under Controls → Mods).
5. API 0.1.108, additions only. The Show store of c36ba3df (`trajectories.show`) is replaced; a saved value of it is kept untouched by the loader (ADR 0292 point 4) and no longer read.

## Consequences

- On the pad and through a normal ascent to orbit nothing draws in Flight below 1 km; the map shows the path while the climb is suborbital.
- Mods can ask the player for a point on a body without their own UI.
