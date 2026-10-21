# 331 — Rendezvous autopilot

**Plan:** [plans/331-rendezvous-autopilot.md](../plans/331-rendezvous-autopilot.md) · **Session:** rendezvous session (Claude) · **Date:** 2026-10-22 · **ADR:** 0286

## What was done

- **ADR 0286, pilot additions** (API 0.1.103): `VesselPilot.warpTo(time)` (`warp-to` at the world's highest allowed level), `VesselPilot.engage(autopilot, params?)` (`autopilot-engage` on the own vessel, replacing the caller), `PilotFacts.propellantMass` / `VesselPilot.propellantMass` (the burning engines' mix over the vessel, limited by its scarcest resource; `packages/sim/src/pilot-facts.ts`). The SDK re-exports `propagateUniversal`, `closestApproach`, `relativeNodes`, `hohmannToTarget`, `orbitalAxes`, `burnComponents`.
- **`guidance.rendezvous`** (`mods/guidance/src/rendezvous.ts`): plan → plane change at the relative node → phasing orbit (same orbit) or Hohmann at its window (or a Hohmann to the target's radius plus circularization, then phasing) → mid-course correction (damped Newton on the miss, aimed 300 m above the target) → match velocity 200 m before the closest approach → close (closed loop on the relative velocity, engine with hysteresis, RCS inside 1 km, learned RCS acceleration as in Auto Dock) → hold. Every far burn is a node flown by `stepNode`; coasts over 120 s are warped to 45 s before the burn.
- **Rendezvous panel** in the Guidance Computer mod: status, phase, distance, relative speed, delta-v used / estimate / left, Stop at, Dock when close, Warp through coasts, Engage, Abort, last run, log.
- Docs: the guide section (`guides/vessel-pilot-api.md`), the docking lesson's debrief and hint, the Mods page blurb.

## What surprised me

- **The first test chaser had no battery.** Its probe core ran dry during the coast and the sim refused the match burn's throttle ("no power"); the node executor kept "burning" on rails and the vessel flew past at 7 m/s. The test vessel now carries a battery and an RTG, and the rendezvous aborts when electric charge runs out. The runner's "lost control" check does not cover power.
- **Warp hands the vessel back on rails.** After a `warp-to` ends the vessel stays on rails; the SAS turn wakes it (`wakeTurningVessels`) and so does the first throttle, so the executor's turn-then-burn works without a wake call.
- **A burn a full turn before the arrival cannot move it radially** (Clohessy–Wiltshire), so the correction is a damped least-squares Newton step rather than a plain 3×3 solve; it is used only when it halves the miss.
- The far phases were nearly exact in the headless tests (closest approach 0.29 km and 0.73 km), so the close phase started on RCS both times.

## Verification output

```
bun test mods/guidance: 12 pass (6 of plan 321, 2 helper tests, 4 rendezvous)
  same orbit 20 km: holding at 156 m, 0.15 m/s; 19.7 m/s used; sim ~1 870 s
  100 km → 150 km, 2°: plane 78.4 m/s, Hohmann 38.4 m/s, match at 0.73 km; holding at 156 m, 0.15 m/s; 166.5 m/s used
  tank at 1 %: "aborted: Not enough delta-v: about … m/s needed, … m/s left."
  Dock when close + targeted port: autopilot is autodock.dock, last run "replaced by Auto Dock", control from the own port
  panel: Ready to engage, distance before engage, settings stored, Engage and Abort
bun run test: 2205 pass, 0 fail
bun run build: done; svelte-check (after the build): 0 errors (before the build it reports the two generated sandbox files missing in a fresh worktree)
web vitest (CI=true) lessons + mods: 47 pass
bun run docs:check: OK
```

## Open questions

- The estimate is rough (plane, Hohmann pair, a phasing allowance, the close phase); it errs high, so a vessel with a thin margin can be refused although it would make it.
- Two-body only: a target in another sphere of influence is refused. Elliptic targets are handled only through the correction and the close phase.
- No browser run: the owner tests on the deployed site. The lesson world blocks warp near another vessel, so a rendezvous started there coasts in real time.
