# 0026 — Design system and flight HUD architecture

**Status:** accepted (its visual language, the tokens, palette, fonts and panel look, is superseded in stages by [0107](0107-ui-adopts-the-refs-visual-language-in-stages.md); the update cadence, navball, speed modes, stage Δv, toasts and pause stand)
**Date:** 2026-10-16
**Plan:** plans/021-hud-and-ui-design-system.md

## Context

ADR 0025 sets the bar: the UI must be release quality. The MVP HUD was a text table updated at 10 Hz through one `$state.raw` object. Plan 021 needs a navball, gauges, a stage stack with per-stage Δv, toasts, a pause menu and map-view markers, in Svelte 5 (ADR 0006), at 60 fps next to the WebGL canvas, with no external art assets.

## Decision

**Tokens and components.** One stylesheet of CSS custom properties (`src/lib/ui/tokens.css`, imported by the root layout) holds colour, type, spacing, radius, elevation and motion tokens; components read tokens only, never literals. Dark translucent panels with a 1 px border, four semantic colours (accent `--c-accent` cyan, positive mint, warning amber, danger red), two fonts: Barlow Semi Condensed for labels, IBM Plex Mono for numbers (tabular figures), both SIL OFL 1.1, self-hosted through `@fontsource/*` packages (woff2, latin subset only is requested by the browser via `unicode-range`). Neither is KSP's font and neither is on the "default roster" (Inter, Geist, JetBrains Mono). Components are Svelte 5 runes components in `src/lib/ui/` (`Panel`, `Button`, `IconButton`, `Icon`, `Readout`, `Meter`, `Kbd`, `Toasts`, `Dialog`), the HUD widgets in `src/lib/hud/`. The icon set is own SVG paths in one file.

**Update cadence.** Svelte renders text and structure from a `HudModel` copied into `$state.raw` at 10 Hz (as before). Per-frame things never go through Svelte: the navball is a `<canvas>` painted from the rAF loop by a plain function (`drawNavball`), fed by the latest snapshot's attitude (the page keeps `latestAttitude` in a plain variable); throttle and speed bars are CSS-variable writes (`el.style.setProperty`) from the same loop. The HUD controller (`lib/hud-controller.ts`) is plain TypeScript owned by `flight-loop.ts`; `flight-loop.ts` only forwards snapshots, frames and key events to it.

**Navball: vector Canvas2D, not a Three scene or a shader.** The ball is drawn as projected vectors: sky disc, ground region (half-ellipse plus rim arc), horizon, pitch ladder (small circles every 10 degrees), heading ticks and labels, and marker sprites, clipped to the disc and shaded with a radial gradient. About 400 segments per frame: cheap, crisp at any pixel ratio, no second WebGL context, works in tests (pure projection maths is separate from painting). Rejected: per-pixel texture lookup (about 100k pixels with atan2 per frame is 8+ ms), a small Three scene (second context, more bundle), a fragment shader (fallback needed when WebGL is missing).

**Navball frame (pinned, tested).** Local horizon at the vessel: up = r̂, north = +Y projected onto the horizontal, east = north × up (right-handed, units-and-frames.md). Vessel axes: nose +Y (thrust axis), navball "up" = vessel +Z, "right" = vessel +X (so a positive `pitch` command about +X moves the nose toward +Z, up on the ball). Pitch = asin(nose·up); heading = azimuth of the nose, clockwise from north; within 0.1 degree of vertical the heading is the azimuth of -Z_up (continuity with a plane pitching through the vertical); roll = angle of vessel right about the nose relative to level, positive right-wing-down. Markers: prograde/retrograde from the velocity in the current speed mode, radial/anti-radial/normal/anti-normal from the orbit (r̂ and h = r × v), shown only when the speed in that mode exceeds 0.5 m/s.

**Speed modes.** `surface` velocity = v − ω × r with ω = (0, 2π/rotationPeriod, 0) (the same rotation the sim uses; atmosphere co-rotates), `orbit` = the snapshot's inertial velocity. `auto` (default) = surface below the atmosphere top (or 10 km on an airless body), orbit above, with 5 % hysteresis; `V` cycles auto, surface, orbit. A surface-rails vessel's snapshot velocity is exactly ω × r (ADR 0024), so surface speed is 0 on the pad.

**Stage Δv (`lib/delta-v.ts`, shared with the VAB, plan 022).** Pure function over a `StagingModel` built from a design (all tanks full) or a live snapshot (current amounts). It replays the staging sequence: fire stage k (engine ignition, decoupler separation of the non-root side, using the module configs from the part definitions), then burn the ignited engines to propellant exhaustion in discrete events, with the sim's own draw rule (breadth-first reachable stores, `crossfeed` barriers, `flowMode`) and its own engine arithmetic (`engineOutput`, `propellantRates` from `@orbital/mod-stock`). Δv of a burn interval is the exact `(F/ṁ) ln(m0/m1)` with constant F and ṁ per interval, so one engine reproduces Tsiolkovsky exactly. Output per stage: Δv in vacuum and at sea level, burn time, TWR at ignition, propellant mass and capacity. It understands the stock engine, decoupler, resource-container and heat-shield modules; other mods need module introspection in the SDK (draft plan 024). Part entity ids are mapped to design indices once, at load, from the part order of the first snapshot (resolveVesselDesign orders parts by ascending index and the sim creates entities in that order).

**Sim events to toasts.** `sim-host.ts` forwards a fixed set of sim events as one plain message `{ kind: 'sim-event', event }` (`stock:engine-flameout`, `part:damaged`, `vessel:mode-changed`, `vessel:destroyed`; staging keeps its `stage` message). `lib/toasts.ts` maps events and HUD-derived transitions (liftoff, orbit reached, touchdown, overheating, refused commands) to toasts through a pure function; the toast store holds at most 4, auto-dismisses by severity and honours `prefers-reduced-motion`.

**Pause.** New `pause` client message; while paused the host neither steps the sim nor ticks the script runner and keeps the wall clock moving so resuming does not burst. `Esc` opens the pause menu (a modal `Dialog`, focus trapped, `Esc` resumes).

**Display details that are decisions.** Altitude shows the height of the vessel's base, not of the root part's origin (`groundClearance`, from the part shapes: 7.5 m for the two-stage vessel, so the pad reads 0.0 m). The throttle gauge shows the throttle the vessel is at, read from the engine modules' snapshot state (`vesselThrottle`), because the snapshot has no control state and scripts or the autopilot would otherwise be invisible; the page's own value is the fallback for a vessel without engines. Dialogs use the native `<dialog>`; `Esc` handling listens to `cancel` as well as `close` and the window-level `Esc` handler calls `preventDefault()` when it opens one.

**Map markers.** The renderer exposes no projection. The page mirrors the renderer's map camera with the renderer's own exported pure rig functions (`initialRig`, `applyRigInput`, `rigOffset`, target = SOI body, up = +Y, fov 50) to project Ap/Pe/vessel markers into overlay positions. This depends on the map camera staying a rig around the body; screenshots verify it, and a `Renderer.project` method is the durable fix (draft plan 024 lists it).

## Alternatives considered

- **Tailwind or a component library** — another dependency, and the look would be the library's. Plain CSS tokens are enough for about ten components.
- **All HUD values as `$state` updated every frame** — thrashes Svelte; rejected by the 60 fps budget and ADR 0006.
- **Δv from a closed form (Σ Isp g0 ln(m0/m1) per stage with fixed masses)** — wrong as soon as engines run through a staging event or share tanks; the event replay is not much longer and matches the sim.
- **Adding `index` to `PartSnapshot`** — cleaner than the load-time mapping but changes the core protocol and API version; not needed.

## Consequences

- Plan 022 reuses `lib/ui`, `tokens.css` and `lib/delta-v.ts`; plan 023 builds menus on `Dialog`/`Button` and the settings on the same tokens.
- A mod engine module unknown to `delta-v.ts` contributes no Δv until the SDK describes engines (draft 024).
- The map markers break silently if plan 019 or later changes the map camera; the journal records the check.
