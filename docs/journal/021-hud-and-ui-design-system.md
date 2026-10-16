# 021 — UI: design system and flight HUD

**Plan:** plans/021-hud-and-ui-design-system.md · **Session:** hud session (Claude, 2026-10-16) · **Date:** 2026-10-16

## What was done

The draft was refined to `ready` at the human's request (measurable criteria, nothing weakened; ADR 0026; research), then implemented in `apps/web` only. No change to `packages/*`, `mods/*` or the sim protocol in core; the sim Worker host gained two messages (`pause` in, `sim-event` out). One new dependency pair: `@fontsource/barlow-semi-condensed` and `@fontsource/ibm-plex-mono` 5.3.0 (both SIL OFL 1.1; verified on fontsource and `npm view`, recorded in `research/web-client.md` and `stack-versions.md`).

| Area | Files |
|---|---|
| Design system | `lib/ui/tokens.css` (colour, type, space, radius, motion tokens), `base.css`, `icons.ts` (own SVG set), components `Icon`, `Button`, `IconButton`, `Panel`, `Meter`, `Kbd`, `Dialog` (native `<dialog>`), `Toasts`; fonts imported in `routes/+layout.svelte` |
| Pure HUD maths (all vitest) | `format.ts`, `speed.ts` (surface/orbit/auto), `navball-math.ts` (attitude, ball geometry, markers), `orbit-info.ts`, `delta-v.ts` (per-stage Δv/TWR/propellant, shared with plan 022), `stage-stack.ts`, `toasts.ts`, `hud-model.ts` (names, labels, ground clearance, real throttle), `map-projection.ts` |
| Host | `messages.ts`, `sim-client.ts`, `sim-host.ts`: `pause`, `sim-event` (flameout, part damage, mode change, loss) |
| HUD | `lib/hud-controller.ts` (plain TS brain), `lib/hud/*` (instrument deck with the canvas navball, warp control, stage stack, resources, orbit strip, app bar, situation bar, map markers, pause menu, help overlay, script panel, status cards), `routes/flight/+page.svelte`; `flight-loop.ts` feeds the controller (snapshots, stage and sim events, input) |
| Other pages | `/` and `/vab` restyled with the tokens only (no behaviour change; the 3D VAB is plan 022) |

Known problems from the human's screenshot, fixed: "Untitled vessel" (blank or default names become a callsign such as `OV-3A9F`, `displayVesselName`), "Stage 0 / 0 fired" (replaced by the stage stack; a design with no stages says so), 174.5 m/s on the pad (surface speed, `0.0 m/s`; the inertial speed returns in orbit mode), and "Altitude 7.5 m" while standing on the pad (the HUD subtracts the root origin's height above the vessel's lowest part, `groundClearance`).

## Manual run

Real Chromium (Playwright build, driven by `agent-browser`) against `vite dev` on port 5182, WebGL on software rendering. Flights were flown with the sample ascent script from the script panel (the dev autopilot reacts on main-thread snapshots, which software rendering delays; in the one headless run where it was used it did not reach orbit and the vessel came down in the sea). The script reached orbit in all but one run, in which the vessel was lost (the `Vessel lost` screenshot; the cold first script tick near the 10 ms budget is a known flake, journal 017). The sim runs 1:1 with wall time, so each run is about seven minutes. Screenshots are in `assets/021-*.png` (palette-quantised to 256 colours to keep the repo small).

| State | 1920x1080 | 1280x720 |
|---|---|---|
| VAB (restyled) | `021-vab-1920x1080.png` | `021-vab-1280x720.png` |
| Pad (surface speed 0.0, altitude 0.0, stage stack, orbit empty state) | `021-pad-1920x1080.png` | `021-pad-1280x720.png` |
| Ascent | `021-ascent-1920x1080.png` | `021-ascent-1280x720.png` |
| Staging (flameout and "Stage 2 fired" toasts) | `021-staging-1920x1080.png` | `021-staging-1280x720.png` |
| Orbit | `021-orbit-1920x1080.png` | `021-orbit-1280x720.png` |
| Map view with Ap/Pe/vessel markers | `021-map-1920x1080.png` | `021-map-1280x720.png` |
| Pause menu | `021-pause-1920x1080.png` | `021-pause-1280x720.png` |
| Script panel restyled | `021-script-1920x1080.png` | `021-script-1280x720.png` |
| Controls overlay | `021-help-1920x1080.png` | `021-help-1280x720.png` |
| Vessel lost state | | `021-lost-1280x720.png` |

Map markers: the Ap and Pe dots sit on the orbit line the renderer draws, the vessel dot on it too, and a marker on the far side of the planet is drawn at 40 % opacity.

**Keyboard-only** (real key presses through CDP): Tab order is Menu, Map, Script, Controls, VAB, Stage, Slower warp, Faster warp, speed-mode chip, each with a 2 px solid focus ring. `Esc` opens the pause menu with focus on Resume, the clock holds (`T+00:24` before and after 2 s), `Esc` resumes; `?` opens the controls overlay, `Esc` closes it; `M` toggles `aria-pressed` on Map; `V` cycles Surface, Orbit, Surface (auto); `.` then `,` step the warp 1x, 2x, 5x, 2x; `Z` and `Space` throttle up and fire stage 1 (the stage row for stage 1 became the current, "engine idle" row after `X` cut the throttle), `X` cuts.

**Cost.** Per-frame HUD work (controller `frame()` plus navball paint plus marker placement) averaged 0.17 to 0.29 ms over 8 000 to 13 000 frames, worst frames 3.7 to 6.1 ms (the first frames after load); the 10 Hz model build averages 0.05 ms, worst 1 ms (dev build, counters in `__orbital.hudStats()`). The flight route CSS is 15.6 KB, the five fonts 95 KB of woff2 (all five are fetched on the flight page), the flight page chunk 722 KB of which almost all is Three.js and the renderer.

## Contrast (AA 4.5:1), text tokens on the worst case of every surface

Translucent panels are composited over white (a sunlit cloud deck) before measuring; `src/lib/ui/tokens.test.ts` enforces it (34 cases).

| token | panel over white | raised over white | solid | field |
|---|---|---|---|---|
| `--text` | 11.65 | 11.65 | 16.47 | 16.38 |
| `--text-dim` | 6.74 | 6.74 | 9.53 | 9.48 |
| `--text-faint` | 5.81 | 5.81 | 8.21 | 8.17 |
| `--c-accent` | 7.60 | 7.59 | 10.74 | 10.68 |
| `--c-positive` | 8.34 | 8.34 | 11.80 | 11.73 |
| `--c-warning` | 8.22 | 8.22 | 11.63 | 11.56 |
| `--c-danger` | 5.56 | 5.56 | 7.86 | 7.81 |
| `--c-violet` | 6.21 | 6.21 | 8.79 | 8.74 |

Dark ink on the accent fill 10.69, on warning 11.57. The first draft of the tokens failed `--text-faint` (4.01) and `--c-danger` (4.09) on the worst-case panel; panel opacity went from 0.80 to 0.86 and the two colours were lightened.

## Self-review against `product/visual-direction.md`

The question: would a player who knows KSP/KSP2 take these screenshots seriously? On the HUD side, yes for the structure and the numbers; it is recognisably a genre HUD with its own look. In detail:

- *Dark translucent panels, thin borders, restrained palette, technical type*: done (one accent, mint, amber, red; condensed sans for labels, Plex Mono tabular numerals for numbers). Radius 8 px panels / 4 px controls, one overlay shadow, no glow, no gradients on chrome.
- *Navball with heading/pitch and pro/retro/radial/normal markers*: done, vector-drawn, correct attitude (tested for six orientations and a brute-force check of the ground region), markers dim at the rim when behind. Falls short: it is a flat-shaded vector ball, not a textured 3D sphere; no target or manoeuvre markers (no such features exist yet); the roll reference ("up" is the vessel's +Z) makes the pad read heading 000, not 090 as KSP players expect.
- *Altitude/speed/vertical speed gauges, throttle*: numbers are large, labelled and tabular; bars are log-scaled and quiet. Falls short: KSP2's coloured arcs around the ball are replaced by bars; the throttle gauge is read-only (keyboard only, no mouse drag).
- *Time/warp control, MET*: present; the disabled state explains itself in a tooltip and for screen readers but not visibly.
- *Stage stack with per-stage Δv, TWR, burn time and fuel*: done and exact (Tsiolkovsky test), with the next stage and the burning stage marked, Δv at sea level or vacuum by altitude. Falls short: part icons are small own glyphs (crude next to real part art), no per-resource stage detail, Δv only for stock modules.
- *Resources panel, orbit strip, situation bar, toasts, pause, help, empty/error states*: all present. The orbit strip and the situation bar are plain; no vessel image.
- *Map overlay*: Ap/Pe/vessel markers with times; no SOI, target or manoeuvre tools.
- *Accessibility*: keyboard path for everything, visible focus, AA text contrast (measured), reduced motion (tokens zero all durations; the only animations are the toast entry and the loading bar), live region for toasts. Falls short: no screen-reader summary of the flight state beyond the labelled meters, and the layout is tuned for 1280x720 and up; below that panels overlap.
- *What still looks like a debug view*: the flight camera (renderer) hides the lower half of the rocket behind the instrument deck at 720p; the script panel is a plain textarea; `/vab` is restyled but is still the form-style editor (plan 022); the home page is a stub (plan 023).

## What surprised me

- A window-level `Esc` handler that opens a native `<dialog>` must `preventDefault()`: the same keypress's default action closes the dialog it just opened. Also, in the headless Chromium used here the dialog closed on `Esc` with a `cancel` event but no `close` event, so `Dialog` listens to both (otherwise the sim stayed paused with no dialog open).
- The HUD throttle was the page's own variable, which scripts and the autopilot never touch (it read 0 % during a scripted burn). The snapshot has no control state; the engine modules copy the vessel throttle into their state, so `vesselThrottle` reads that.
- The stage burn model needs the sim's real draw rule (breadth-first from the engine, `crossfeed: false` barrier) to get which tank feeds which engine; the event replay is not much longer than a closed form and matches `createSim` after real burns (live test: burn time after 10 s of flight is 10 s shorter).
- Part entities map to design indices by position: `resolveVesselDesign` returns parts in ascending index and the sim creates entities in that order, so the first snapshot is enough; no protocol change.
- The dev autopilot (`P`) is unreliable under software rendering (it reacts on main-thread snapshots); the script runner lives in the Worker and flew the screenshot runs.
- Headless Chromium throttles `requestAnimationFrame` when the page is not the active target, so DOM reads right after an input can be stale; screenshots and waits were done on text with generous timeouts.

## Decisions made

ADR 0026 (design system and HUD architecture). Draft plan 024 (module descriptors for Δv, `Renderer.project`).

## Open questions / follow-ups

- Plan 024: SDK module descriptors so a mod engine gets stage Δv; `Renderer.project` to replace the map-camera mirror (`map-projection.ts`, pinned to the renderer by a test).
- Plan 022 reuses `delta-v.ts` (`stagingModelFromDesign`, `stageDeltaV`, `twr`) and `lib/ui`.
- Plan 023: main menu, settings (units, key bindings, graphics preset) on `Dialog`/`Button`; the controls list in `HelpOverlay` is static text and should read the bindings then.
- The flight camera could offset the vessel above the instrument deck (renderer).

## Verification output

See the plan Log for the final command output. Commands: `bun run --filter @orbital/web test`, `bun run typecheck`, `bun run build`, `bun test`, `bun run docs:check`, `bunx prettier --check .` in `apps/web`.
