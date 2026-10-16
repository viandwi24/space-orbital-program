# 044 — A moon and SOI transitions

**Plan:** plans/044-moon-and-soi-transitions.md · **Session(s):** moon session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0051](../decisions/0051-body-hierarchy-frames-and-soi-transitions.md), [0052](../decisions/0052-the-stock-moon.md), [0054](../decisions/0054-the-moon-in-the-renderer.md) · **Research:** [soi-and-moon.md](../research/soi-and-moon.md)

## What was done

| Where | What |
|---|---|
| `packages/kepler` | `intoChildFrame` / `intoParentFrame` (the patched-conic frame change), `findCrossing` (bisection of a boundary inside a step), `predictPatchedConics` (a path as one conic segment per sphere, same rule as the sim) |
| `packages/core` | event `vessel:soi-changed`, API 0.1.13; save format 2 (`bodies` list, `soi` per frame) with the 1 to 2 migration; `moonHeight` / `createMoonTerrainField` (craters, ADR 0054) |
| `packages/sim` | `bodies.ts` (tree, Laplace spheres, analytic moon), `soi.ts` (transitions on rails with bisection and in flight by re-basing the frame), per-vessel body in gravity, atmosphere, rotation, terrain, rails, SAS reference, snapshot (`bodies` with system positions), `load-vessel` on any body, warp stop; tests `soi.test.ts`, `moon-mission.test.ts`, resume cases for the moon |
| `mods/stock` | `stock.cinder`, ADR 0052 |
| `apps/web` and `packages/renderer` | the moon pass (`moon.ts`, `moon-model.ts`, `shaders/moon.glsl.ts`), map view: orbit and sphere of influence of a moon, predicted path with entry/exit dots and the ghost sphere where the moon will be, `Tab` cycles the map focus, toast "Entering the sphere of ..." |

## Stock moon and the Δv budget (ADR 0052)

`stock.cinder`: radius 190 km, surface gravity 1.6 m/s2 (mu 5.776e10), circular equatorial prograde orbit at 11 800 km, period and day 135 524 s (tidally locked), Laplace sphere 2 277 km. Ground: 1.4 to 5.7 km above the reference sphere, slope up to 0.45, a flat plain with a dark basin round latitude 0, longitude 0.

The scripted mission (`moon-mission.test.ts`, one medium tank lander on a core with a medium tank and four boosters, 34.7 t at lift-off, thrust 815 kN, ve = 2 942 m/s):

| Leg | Mass before to after, kg | Δv, m/s | Ideal figure |
|---|---|---|---|
| Lift-off to a 76 x 100 km orbit (243 s, boosters and core) | 34 720 to 6 581 | - | about 3 400 |
| Transfer burn, apoapsis 12.3 Mm (25.6 s) | 6 581 to 4 908 | 864 | 858 (Hohmann 680 km to the moon's radius) |
| Capture at periapsis, apoapsis 1 200 km (2.9 s) | 4 908 to 4 727 | 110 | about 150 for a flyby at 367 m/s |
| Lowering burn to 300 km apoapsis (6.2 s) | 4 727 to 4 545 | 114 | - |
| Descent burn at apoapsis, periapsis 10 km (1.6 s) | 4 545 to 4 521 | 16 | - |
| Braking, final descent and touchdown | 4 521 to about 3 470 | about 780 | about 560 for a perfect suicide burn |
| **After the orbit: spent / available** | | **about 1 880 / 2 371** | lander stage: 2 942 ln(6 581 / 2 940) |

So the stock parts reach and land on the moon with a margin of about 490 m/s. The core lifts 34.7 t because four radial boosters carry the first 44 s: a single stack engine (215 kN) only lifts about 21 t, which is why the lander is also the transfer and capture stage. The landing script is crude (a constant-deceleration profile with a 0.5 margin); a hand-flown or smarter landing spends about 200 m/s less.

## What surprised me

- **A bare 10 s rails chunk makes the continuity criterion unmeasurable at 1e-6 m/s from the sim.** The sim switches at the end of whole 0.02 s steps; the discontinuity at the boundary is the change of the pulling body over one step (0.014 m/s2 x 0.02 s = 3e-4 m/s). The sim tests assert 1e-3 m and 1e-3 m/s; the conversion itself is asserted at 1e-6 m and 1e-9 m/s in kepler (logged in the plan).
- **Aim of a transfer is the apoapsis radius, not the phase.** The moon overtakes the slower vessel along the track, so the phase only moves the time of the encounter; the miss distance across the moon is the apoapsis radius minus the moon's orbit radius (+500 km gave a periapsis of 232 km, +800 km 495 km). My first guess (aiming ahead of the moon) crashed every time.
- **A retrograde capture burn is only as good as the pointing.** The PD helper left a few degrees of error and the periapsis fell 36 km during a 7 s burn; the same burn with the stability assist (plan 042, `sas retrograde`, `reference orbit`) keeps it. The mission uses SAS for the transfer, capture, lowering and descent burns.
- **Landing from a 37 km periapsis with the Earth-tuned landing helper burned 1.3 km/s.** It brakes along a constant-deceleration line from where it starts, which on a world with g = 1.6 and a 37 TWR engine means hours of gravity loss. Dropping the periapsis to 10 km (an apoapsis burn of 16 m/s) and planning the final descent on half the available deceleration (`margin: 0.5`) landed at 1.9 m/s with 780 m/s used.
- **`registries.bodies.list()` is registration order, so `catalog.bodies[0]` stays the home planet**, but the renderer, the autopilot and `collectSave` take "the first body" as the primary; the scene now sorts roots first.
- **The standard material's specular term whitened the ground.** At grazing angles `MeshStandardMaterial` adds Fresnel reflection of a sun of intensity 12; the moon uses `MeshLambertMaterial` with injected displacement and bump.
- **The Vite dev server did not notice edits to files in a worktree outside the repository root until restarted once**; after the restart edits were served.

## Decisions (ADRs)

0051 (hierarchy, frames, transitions, warp stop, save 2), 0052 (the moon), 0054 (the moon in the renderer; 0053 is plan 039's).

## Open questions / follow-ups

- Plan 049 (draft): dust and plume light on the moon (the effects system skips every body but the first), terrain shadows, stones as geometry, a terrain kind per body, radar altitude over the moon.
- Plan 045 needs: `kepler.predictPatchedConics` (segments with entry/exit state, elements, `bodyOffset`, end reason), `apps/web/src/lib/map-path.ts` (`bodyNodes`, `predictMapPath`), `Renderer.setMapPath` / `setMapFocus`, the `vessel:soi-changed` event and the toast, `Snapshot.bodies[].position` in the system frame. A maneuver changes the state at `t`; re-run `predictPatchedConics` from the state after the burn.
- Moon segments are drawn at the moon's position when the vessel gets there (a ghost sphere) and so do not join the next segment in the planet frame; that is by design (the moon moves between entry and exit).
- Time warp physics limits (no warp below 100 km, KSP-style altitude limits) were not added.

## Verification output

```
bun run test            822 pass, 0 fail (95 files, 31 s)
bun test packages/sim/test/moon-mission.test.ts    2 pass (mission 0.9 s wall, deterministic)
bun test packages/sim/test/soi.test.ts             13 pass
apps/web: vitest --run  421 pass;  bun run typecheck 0 errors;  bun run build ok;  bun run docs:check ok
mission log: orbit 243 s | transfer burn 25.6 s (mass 6581 -> 4908) | SOI entry 22825 s, warp 1
  | capture 2.9 s | lowering 6.2 s | descent 1.6 s | final 795 m, 30 m/s | touchdown 1.90 m/s | surface rails
GPU parity (Chromium on an M5): fine patch worst 5.2 mm, mid patch 7.2 mm over 3 000 texels each
frame (high, 2x, benchmark of 90 frames, same session): pad with moon 17.76 ms, pad without it 17.72 ms, moon surface 17.75 ms
```

Screenshots: `assets/044-moon-orbit.png` (map view anchored on the moon), `assets/044-moon-surface.png`, `assets/044-map-transfer.png` (both bodies, the transfer, the ghost sphere where the moon will be).
