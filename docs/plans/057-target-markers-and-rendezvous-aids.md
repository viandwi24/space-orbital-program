---
id: 057
title: "Target markers and rendezvous aids"
status: done
owner: "rendezvous session (Claude, 2026-10-17)"
depends: [035]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 057 — Target markers and rendezvous aids

## Goal

What plan 035 left out of targeting: showing the target where the player looks (navball, map, flight view) and the aids a rendezvous needs beyond a number in a card.

## Context

- ADR 0065 (target state, relative vectors, closest approach on two conics about one body), journal 035, plan 045 (the navball marker for a node as the model for a target marker).

## Scope

**In (all five candidates; ADR 0084 records the choices):**

1. Navball markers for the target and its anti-target, relative-velocity markers (`target-prograde`, `target-retrograde`) and a speed reference `target` in the speed readout (research `research/rendezvous-aids.md`).
2. Map view: the target's marker and orbit, the vessel's and the target's positions at the closest approach (a marker pair with the distance), a click on a body or another vessel (or on a body's orbit line) to target it.
3. A closest approach across spheres of influence, computed in the page by `kepler.closestApproachPatched` (the vessel's patched-conic path against the target's motion). The sim's same-primary `approach` (ADR 0065) stays as it is.
4. Node helpers in `kepler` (match velocity at the closest approach, Hohmann transfer to the target's orbit with the phase-angle wait, relative ascending and descending nodes with the plane-change burn) and four buttons in the Target card that place the node (`node-set`, no new command).
5. A target in the flight view: a distance label near the target, an edge arrow when it is off screen or behind the camera.

**Out:** docking, other vessels as controllable, a rendezvous autopilot, a core API change (the sim, the save format and the script API do not change).

## Steps

1. Step 0: research, ADR 0084, this refinement.
2. `packages/kepler/src/rendezvous.ts` and tests (patched track, closest approach across spheres, match-velocity burn, Hohmann, relative nodes).
3. Web pure modules with vitest: `speed.ts` target mode, `navball-math.ts` markers, `rendezvous-aids.ts` (approach, aids to `node-set`), `map-pick.ts`, `target-indicator.ts`.
4. UI: navball glyphs, speed chip, map overlay (`TargetMapLayer.svelte`), flight-view indicator, Target card buttons; wiring in `hud-controller`, `flight-loop`, the flight page.
5. Manual rendezvous from a generated two-vessel save; screenshots; docs; roadmap entry removed.

## Acceptance criteria

- [x] kepler `closestApproachPatched` equals a brute-force scan of the same two motions (dense sampling, 20 000 samples) within 1 m of distance and 1 s of time, for (a) a vessel and a body in one sphere, (b) a vessel on its way to the moon (the path crosses into the moon's sphere) against the moon, and (c) a vessel inside the moon's sphere against a vessel orbiting the planet (`bun test packages/kepler`).
- [x] kepler `matchVelocityBurn` at a closest approach equals the hand value `v_target - v_vessel` (components in the orbital frame within 1e-9 m/s) and, applied, makes the relative speed 0 within 1e-6 m/s.
- [x] kepler `hohmannTransfer` equals the textbook values for r1 = 7 000 km to r2 = 42 164 km about the Earth-like `mu` (hand values in the test, within 1e-6 relative); `hohmannToTarget` for two coplanar circular orbits: after the departure burn and the transfer time the vessel is within 1 m of the target's position; the departure time equals the phase-angle formula of the research note.
- [x] kepler `relativeNodes` for two circular orbits with relative inclination 20 degrees: the two nodes lie on the line of nodes (within 1e-9 rad), differ by half a period, the plane-change burn is `2 v sin(10 degrees)` within 1e-6 relative and the post-burn orbit normal is parallel to the target's (angle < 1e-9 rad).
- [x] web vitest: `speedReadout` in `target` mode returns the vessel's velocity relative to the target, speed = `relativeSpeed`, `vertical` = range rate; `nextSpeedMode` visits `target` only when there is a target; a preference `target` without a target falls back to auto.
- [x] web vitest: `markerDirections` with a target returns `target` along the unit relative position and `anti-target` opposite, in target mode `target-prograde` along minus the target's relative velocity and `target-retrograde` opposite (exact vectors), without `prograde`/`retrograde`; no relative-velocity markers below 0.5 m/s; the painter draws every new kind without throwing (fake context).
- [x] web vitest: map markers: the target, the closest-approach pair and the target orbit are placed with `Renderer.project` (a fake projection checks the inputs: target world position = the SOI body's centre + vessel position + relative position; approach points = the propagated positions at the approach time); `map-pick` picks the nearest body, vessel or orbit line within the radius and prefers a marker over a line.
- [x] web vitest: the flight-view indicator gives a label inside the box, an edge arrow with the right angle when the projection is outside it, and for a point behind the camera the arrow points away from the mirrored projection.
- [x] web vitest: `rendezvous-aids` approach agrees with the sim's `target.approach` (same primary) within 1 km and 1 s, gives a result where the sim gives `null` (different spheres), and each aid yields a `node-set` command whose node, replayed by `kepler.predictWithManeuvers`, does what it says (match: relative speed 0 at the approach; Hohmann: encounter within 1 % of the target's orbit radius for the circular test case).
- [x] [manual] A generated two-vessel save (an orbiter and a target probe ahead and 15 km higher), played in the built client with only the aids and SAS/RCS-free engine burns (or a script through the sandbox): closes to under 500 m with relative speed under 2 m/s. Screenshots `docs/journal/assets/057-*.jpg` (navball in target mode, map with the marker pair, flight view label).
- [x] `bun run test`, web vitest, `bun run typecheck`, `bun run build`, `bun run docs:check`, prettier on the touched files, and one single-engine e2e pass; the roadmap page no longer lists 057 and its test passes.

## Docs checklist

- [x] `STATUS.md`, journal `docs/journal/057-target-markers-and-rendezvous-aids.md`, ADR 0084, `research/rendezvous-aids.md`, `architecture/` (kepler functions), user guide / help text for the new keys (none new; the speed chip), glossary if a term is new, roadmap entry removed.

## Log

- 2026-10-17 — Created as draft by plan 035.
- 2026-10-17 — Refined draft → ready at the human's request (session: rendezvous session).
- 2026-10-17 — Started (in-progress); ADR 0084.
- 2026-10-17 — Done. Evidence: journal 057 (kepler 13 tests against dense scans and hand values; web vitest 725; manual rendezvous: 35.8 m and 0.057 m/s with the Hohmann and match-velocity aids, script-executed burns; screenshots `docs/journal/assets/057-*.jpg`; one chromium e2e `e2e/target.e2e.ts`). Deviations: the closest-approach test for the sim comparison uses the sim's window (one revolution, 240 samples) because the page looks further ahead; `[manual]` burns executed by a sandbox script, aids pressed by hand.
