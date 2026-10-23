# 381 — The wider stock system

**Plan:** [plans/381-stock-system-expansion.md](../plans/381-stock-system-expansion.md) · **Session:** stock system expansion session (Claude) · **Date:** 2026-10-23 · **ADR:** 0318

## What was done

- **Twelve new stock bodies** in `mods/stock/src/bodies.ts`: Kiln, Vesper, Ochre (Mote, Flick), Vagrant, Tempest (Forge, Rime, Bastion, Husk) and Glim.
  - Planet orbits are written against the ecliptic (`orbitAgainst`, `ECLIPTIC`). Moon orbits are written against their planet's equator. Poles are tilted from the orbit normal (`tiltedPole`). Moons are tidally locked.
  - Each planet's phase at t = 0 is calibrated against the trip planner, so its first window from Home falls on its design day.
- **`BodyDefinition.appearance`** (API 0.1.113): palette, pattern, sky, haze, clouds, rings.
- **Renderer:**
  - `body-look.ts` (pure, tested) bakes colour maps, cloud maps, ring strips and sky weights.
  - `body-dress.ts` holds a body's far sphere, clouds and rings. The map starts at 128 × 64 and is baked to 512 × 256 a few rows a frame (3 ms budget) once the body is near.
  - The moon pass multiplies its regolith by the map (`uLook`; Cinder's is white).
  - Moon-pass bodies with an appearance sleep until they cover 40 px of radius or hold the vessel. `moonPasses` lists only the awake ones, so WebGPU builds no MoonTSL and no pipelines for them at load.
  - The air takes `sky` and `haze` through the existing uniforms. Its optics stop thickening past 2.5 atm, and there is no ozone away from Home.
- **Sunlight** is aimed from the camera once it is outside Home's sphere. Before, every body was lit along Home→Sun, so planets across the system showed the wrong phase. Sol had the same problem.
- **Web:** the scene config carries `appearance`. The system art reads it: palette, cloud colour, sky halo, bands and rings.
- **Gameplay:**
  - The main line goes on after the Moon: `stock.ochre-flyby`, then `stock.ochre-landing`, then `stock.tempest-flyby`.
  - The Nuclear power node asks for an Ochre flyby.
  - The Cinder transfer lesson's debrief and hint point at Ochre.
  - Contracts already offer planet flybys.
- **Tests:**
  - `stock-system.test.ts`: the hierarchy, the spheres, the closest approach of sibling orbits, rings, the windows, and that Husk is retrograde.
  - `stock-transfer.test.ts`: a stock upper stage flies Home to Ochre headless.
  - `save-format.test.ts`: a format-7 world loads with the new bodies.
  - `body-look.test.ts`.
- **Tools:** `tools/stock-dv-map.ts` writes the Δv tables of `docs/research/stock-system.md`. `apps/web/scripts/capture-stock-system.ts` takes the look check.

## What surprised me

- The renderer had no per-body look at all. A body without terrain took one of four colours by its index.
- An exact 180° Hohmann transfer is a singular Lambert problem. The test flies 97 % of the Hohmann time.
- A one-minute ejection burn on a fixed node vector at 80 km leaves about 50 m/s: past its minimum, the node's Δv climbs again. The test cuts the throttle there, as a player would, and a 44 m/s correction finishes the job.
- The sim's tree order (root, then children by id) puts Glim before Home in snapshots. Tests that listed the bodies use `helpers/stock-tree.ts`.

## Open questions

- The craters height function has a landing plain of 10 to 42 km of arc at +X. A body of 7 to 13 km (Vagrant, Mote, Flick) is all plain. A small-body terrain kind (lumpy shape, small craters) would suit them.
- A hidden crater "basin" sits at +X on every craters body.
- The home Space Center's label shows on the map from anywhere in the system.
