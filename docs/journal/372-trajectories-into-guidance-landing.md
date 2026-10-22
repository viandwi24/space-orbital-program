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
