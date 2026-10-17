# 057 — Target markers and rendezvous aids

**Plan:** plans/057-target-markers-and-rendezvous-aids.md · **Session(s):** rendezvous session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0084](../decisions/0084-target-markers-and-rendezvous-aids.md) · **Research:** [rendezvous-aids](../research/rendezvous-aids.md)

## What was done

| Where | What |
|---|---|
| `packages/kepler/src/rendezvous.ts` | `patchedTrack`/`trackOfSegments` (the patched-conic path, also with nodes, as a function of time), `closestApproachPatched`/`closestApproachOnTrack` (across spheres of influence), `bodyTrack`/`conicTrack`, `matchVelocityBurn`, `hohmannTransfer`, `hohmannToTarget` (phase-angle wait, `minWait`), `relativeNodes` (plane crossings with the plane-change burn); 13 tests |
| `apps/web` pure | `speed.ts` (`target` reference, range rate), `navball-math.ts` (target, anti-target, target-prograde, target-retrograde), `rendezvous-aids.ts` (approach with nodes, five aids to `node-set`), `map-pick.ts`, `target-indicator.ts`, `map-path.ts` (`maneuverReach` extracted) |
| `apps/web` engine room | `target-view.ts` (approach and aids refreshed once a second; map and flight-view frames; click picking), wired in `flight-loop.ts` (click order: body disc or vessel dot, then the path, then an orbit line), `hud-controller.ts` (markers, speed mode, `rendezvous`), `maneuver-controller.ts` (`onPath`) |
| `apps/web` UI | `TargetMarkers.svelte` (SVG/DOM layer: target marker and orbit, closest-approach pair, dots for other vessels, flight-view label and edge arrow), `TargetPanel.svelte` ("Plan a node" with five buttons and their numbers), navball glyphs, speed chip "Target" with "range rate" |
| docs | ADR 0084, research note, simulation architecture, glossary; roadmap entry 057 removed |

## What the numbers say

```
kepler closestApproachPatched vs a 20 000-sample scan plus a fine scan: within 1 m and 1 s in one sphere, across the moon sphere, moon sphere vs a planet orbit
hohmannToTarget (outward 7000 -> 12000 km, inward 12000 -> 7000 km): arrival within 1 m of the target; the phase angle at departure equals pi - n2 tH within 1e-9
relativeNodes (20 degrees): nodes on the line of nodes within 1e-9 rad, half a period apart, burn 2 v sin(10 deg) within 1e-6 relative, post-burn plane parallel within 1e-9 rad
web: page approach vs the sim's target.approach (two probes, same window and samples): within 1 km, 1 s; for a body target within 1 km; where the sim says null (moon sphere vs planet orbit) the page gives a value equal to a brute force scan
Hohmann aid on the sim's own circular orbits (150 km to 300 km): node prograde within 1 % of the vis-viva hand value; the path with that node meets the target within 1 % of its orbit radius
bun run test 1238 pass; web vitest 725 pass; typecheck 0 errors; build ok; docs:check OK; one e2e (chromium) pass
```

## In the browser (manual criterion)

Production build served from a copy on port 5234. A generated save (`Orbiter`, a probe with an LV engine, at 150 km; `Target probe` at 165 km and 0.1 rad ahead, so 76 km away, 214 m/s relative) was imported through the load dialog. In the Target card: Hohmann aid (10.7 m/s now, 10.7 m/s on arrival after 18 min), then the burns executed by a script from the sandbox that points SAS at the node, warps to it and burns at 10 % throttle centred on the node time (the aid buttons were pressed by hand): the first burn left a closest approach of 35.2 m (the card, with the node planned, said 0.0 km before the burn), the "Match velocity at closest approach" aid placed the second node, and after it the script printed **35.8 m distance and 0.057 m/s relative speed**. Screenshots: `assets/057-flight-view-target-arrow.jpg` (arrow and label at the screen edge, 76 km), `057-map-target-markers.jpg` (target orbit, closest-approach pair, "15.0 km in 19:22"), `057-navball-target-mode.jpg` (speed reference Target, 214.7 m/s, range rate), `057-rendezvous-result-script.jpg`, `057-flight-view-label-at-36m.jpg`.

## What surprised me

- **The first attempt missed by 1.36 km, with a perfect plan.** The script burned until the node vanished; a node whose time has passed disappears at under 0.5 m/s left, so the burn stopped up to 0.5 m/s short, and an error of that size moves a half-orbit transfer by about a kilometre. The second run burns at 10 % throttle centred on the node and carries on for the 0.14 s that the vanishing threshold hides; 35 m. Worth knowing for anyone scripting a burn: use the node's `dv` only until it disappears, not as the stop condition.
- **The first screenshot had no arrow: it was under the right-hand panels.** The indicator now lives inside the view the panels leave free (`setViewInsets` is reused).
- **A body target's name was its id on the map** (`stock.cinder`) while the flight label said "Cinder"; caught by the e2e.
- **The sim's closest approach and the page's differ only by window.** The sim looks one revolution ahead; the page looks `predictionHorizon` (at least 6000 s, so more than two revolutions in low orbit), so the page can find a closer pass; the test compares them with the same window and samples.
- **`ship.velocity`-based burn control does not work for a node**: gravity changes the velocity during the burn, so "start velocity plus node vector" is the wrong goal (a 1.5 s burn at 750 km altitude loses 9 m/s to gravity bending); the node's own `dv` is right.
- **At 1024x768 the instrument deck still covers the lower part of the right column** (plan 035 noticed it); the Target card with its five buttons is taller now and scrolls; "Plan a node" can be folded.

## Decisions (ADRs)

0084: page-side approach and aids, markers as a DOM layer over the canvas (no renderer change), the `target` speed reference (not a SAS reference), disc of the sphere the vessel is in is not clickable.

## Open questions / follow-ups

- Hohmann assumes circular, coplanar orbits at the current radii; an eccentric target or a big inclination needs a Lambert/iterative solver (no draft yet; the aids are a start for the player, who refines the node by hand).
- The closest approach follows a target vessel only on its current conic; a target that changes sphere inside the window is not followed.
- The relative-velocity markers are hidden under 0.5 m/s, which also hides them at the end of a rendezvous; a smaller threshold in target mode would help close-in work (docking is out of scope).
- Nodes placed by an aid are not selected in the map automatically.

## Verification output

```
bun test packages/kepler/test/rendezvous.test.ts   13 pass
bun run test                                        1238 pass, 0 fail (139 files)
apps/web vitest --run                               725 pass, 0 fail
bun run typecheck                                   0 errors (svelte-check 1524 files)
bun run build                                       ok
bun run docs:check                                  OK (68 plans, 83 ADRs)
prettier --check (touched files)                    all formatted
playwright e2e/target.e2e.ts --project=chromium     1 passed (workers 1)
```
