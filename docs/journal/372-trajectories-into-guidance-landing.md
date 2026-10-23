# 372 — Trajectories into the Guidance Landing tab

**Plan:** [plans/372-trajectories-into-guidance-landing.md](../plans/372-trajectories-into-guidance-landing.md) · **Session:** rendezvous session (Claude) · **Date:** 2026-10-22 · **ADR:** 0309

## What was done

- `mods/trajectories` removed (package, built-in, panel, settings, keybindings); the web's built-ins, `package.json` and the Mods runtime test follow. The overlay API stays.
- `mods/guidance/src/predict.ts` (moved as is) and `landing-path.ts`: overlay `guidance.path`, stores `guidance.path-settings` `{ show }` (default on) and `guidance.landing-target`, keys for the target and the toggle, the `guidance.predictor` system, `visibility` (in the air or coming down only; while Land flies, or with the toggle on and no other Guidance program flying), the heat-coloured arc, the impact and target markers, meta `time`, `distance`, `speed`, `error`, `heat`.
- The Landing tab: Impact in, Target error, Impact distance, Speed at impact, Peak heating; Show predicted path; Pick landing target on the map; Target at impact; Clear target; Engage passes the target.
- `guidance.land` with `params.target`: the deorbit waits until a burn now would touch down on the target (`deorbitAim`, a descent model that coasts and then brakes on the autopilot's own speed profile, the ground turning), warping most of the wait; the coast re-predicts twice a second and burns across toward the target while far out; the brake leans toward it above 100 m.
- `PilotBody.rotation` (API 0.1.109). The mod guide's overlays walk-through now follows the Guidance Computer.

## What surprised me

- Aiming the deorbit at the conic's impact landed 80 km off, then (with a full-thrust brake model) 41 km past; the brake follows a speed-for-height profile at half the spare thrust, and the model had to fly the same law. With that and the coast steering: 1.2 km from a target 497 km away.
- The target can be just behind the first impact estimate: the burn now fires when the impact has passed the target by less than 0.02 rad, else it waits an orbit.
- The web's trajectory-golden snapshot on main has duplicated entries (bun's writer); not touched here.

## Verification output

```
landing path: predicted 92 s over 78398 m; flew 91 s; missed by 920 m
targeted landing: done: Landed, 1219 m from the target
bun test mods/guidance + vessel-pilot + sim autopilot: 57 pass
web vitest mods + dock: 52 pass; svelte-check: 0 errors; bun run build: done (no trajectories in the bundle)
```

## Open questions

- On a body with air the deorbit model has no drag; the coast steering stops at the brake, so expect a larger miss on the home planet.

## Follow-up: Auto / Always / Off (same day)

The owner: "di guidance bisa di force muncul terus juga ga harus pas auto landing yah". The Landing tab's switch became **Predicted path**: `Auto` (the ADR 0309 point 3 rules, the default), `Always` (Flight and map whenever the path comes down, from the first metre of a manual flight and under other programs; never landed, on the pad or splashed), `Off` (nowhere, Land included). Stored in `guidance.path-settings` as `{ mode }`, saved with the world; a save with the old `{ show }` reads on as Auto, off as Off. Test: Always, a 900 m manual hop with no program engaged draws the arc in Flight and the map. `bun test mods/guidance`: 49 pass.

## Follow-up: a targeted landing robust to the thrust-to-weight (2026-10-23)

The realistic-parts session (plan 380) found a 5 % change in the lander's acceleration took the miss from under 3 km to 9.7 km. Two causes: the coast steering projected a miss measured at the touchdown (up to a quarter of the way round) onto the vessel's own horizontal, so it pushed the wrong way; and the deorbit aim depended on a model of the brake that the real brake did not follow.

The landing no longer predicts the brake. The deorbit times its conic to come down one braking distance (v² / 2·0.6·√(a² − g²)) past the target; the coast does not steer; the brake starts once stopping across the ground needs the distance left (or the fall needs it) and tracks a velocity: across toward the target at the distance left over the time left, never faster than stops on it; down no faster than the crossing takes; vertical thrust first, what is left across. Test: the lander from a 20 km orbit to a target 150° ahead, with the tank at 100, 85 and 70 % (a thrust-to-weight spread of about 15 %), lands 47, 59 and 61 m from it; the bar is now 1 km. `bun test mods/guidance`: 51 pass.
