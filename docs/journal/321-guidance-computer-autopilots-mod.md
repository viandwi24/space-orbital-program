# 321 — Guidance Computer

**Plan:** [plans/321-guidance-computer-autopilots-mod.md](../plans/321-guidance-computer-autopilots-mod.md) · **Session:** vessel programs session (Claude), 2026-10-21 · **ADR:** 0277

## What was done

- **ADR 0277:** `createVesselPilot(view, id, send, facts?)`; the pilot reads `body` (mu, radius, atmosphere height, spin), `mass`, `engines`/`maxThrust`, and gets `addNode`/`removeNode`. The sim's runner passes `pilotFacts(core, id)` (`packages/sim/src/pilot-facts.ts`: `totalMass`, engine descriptors of ADR 0033, `bodyAngularVelocity`).
- **`mods/guidance`** (`@orbital/mod-guidance`, built in): `guidance.node`, `guidance.circularize`, `guidance.ascent`, `guidance.land` and the "Guidance Computer" panel; two-body helpers in `orbit.ts`.
- **Web:** in `BUILTIN_PLUGINS`; the Mods page describes it.

## What surprised me

- **Autopilot memory is copied as JSON every step**, so `Infinity` came back as `null` and the node executor ended at once (`dv > null + 0.05`). The memory now uses `-1` and `-1e9`; the guide says to keep memory JSON-safe.
- **A node set this step has no burn vector yet**: the prediction fills it in the next step. The executor waits instead of aborting.
- **The touchdown measure:** the root part is the pod, about 7 m above the feet, and the moon turns under the lander (inertial 8.4 m/s at the ground, 1.4 m/s over it). The landing clears the lowest part and the test reads the autopilot's ground speed.
- The first ascent attempt reached orbit; the gravity turn shape `0.5` to 75 % of the atmosphere was enough for the reference two-stage rocket.

## Verification output

```
bun test mods/guidance: 6 pass (node 300 m/s to < 1 m/s, circularize e < 0.005, ascent periapsis > 70 km, moon touchdown < 2 m/s, player throttle wins a burn and program-stop disengages, refusals)
```

Browser (dev server on the worktree): the Mods page lists Guidance Computer under Built in; in Flight `autopilot-engage guidance.ascent` on the two-stage on the pad flew the turn (pitch 90° to 76° by 1.7 km) and the status bar said "2 programs" (the resumed test script and the autopilot). The pane was hidden for part of it, so the browser run was stopped there; the full ascent is the headless test.

## Open questions

- Vacuum thrust only: an ascent through thick air has less than `maxThrust`; the closed loop copes, a sea-level figure would help a landing on a planet with air.
- The landing does not deploy legs (the pilot has no action-group call); the player or a script does.
- No warp: the node executor waits for the node in real time; a `warp-to` call on the pilot would be the next step.
