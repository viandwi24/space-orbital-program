# 0318 — The wider stock system and a body's appearance

**Status:** accepted
**Date:** 2026-10-23
**Plan:** plans/381-stock-system-expansion.md
**Builds on:** ADR 0052 (the moon), ADR 0054/0067/0090 (the moon pass), ADR 0119 (the Sun and the system frame), ADR 0121 (a moon's own air), ADR 0178/0180 (science thresholds and regions), ADR 0273 (generated system art), ADR 0308/0310 (shader compile at load)

## Context

The owner (2026-10-23): "perluas sistem stock dengan planet baru" — expand the stock system with new planets. Until now it held the Sun, Home and Cinder. The stock system is the easy mode next to Sol, so the new bodies stay small (KSP scale) and each is a distinct destination with its own difficulty.

The renderer had no per-body look. A body without terrain was a flat Lambert ball in one of four colours. A craters body was Cinder's grey regolith. A moon's air was always the home planet's blue. Nothing drew bands, rings or cloud decks. Each body drawn by the WebGPU moon pass also built its own set of pipelines at load, because its radius and seed are inlined into the node graph. Twelve new bodies at load would have cost dozens of pipelines, and Windows shader compile time is already a known problem (plan 370).

## Decision

1. **Twelve new stock bodies**, all fictional, in `mods/stock/src/bodies.ts`:
   - **Kiln**: the inner hot rock, airless, expensive to reach.
   - **Vesper**: the hot world under 5 atm, easy to land on and hard to leave.
   - **Ochre**: the red planet with thin air and polar caps. Its two captured moonlets are **Mote** and **Flick**.
   - **Tempest**: the ringed hydrogen giant. Its moons are **Forge** (volcanic), **Rime** (ice over an ocean), **Bastion** (large, thin nitrogen haze) and **Husk** (a captured rock on a retrograde orbit).
   - **Glim**: the icy dwarf on a 12°, e = 0.27 orbit.
   - **Vagrant**: an asteroid on an e = 0.68 orbit.

   The numbers and the Δv map are in `docs/research/stock-system.md`. Home and Cinder are unchanged.
2. **Orbits are written against the ecliptic.** Planet elements are given against Home's orbit plane, which is 23.44° from the system's +Y frame (ADR 0119). Moon elements are given against the parent's equator. A helper (`orbitAgainst`) turns them into system-frame elements, so the inclinations in the file read as in a textbook. Poles are tilted from each orbit normal (`tiltedPole`). Moons are tidally locked and share their planet's pole.
3. **The first transfer windows come early.** Each planet's phase at t = 0 is set so that the trip planner (`hohmannToTarget`) finds its first window from Home on a chosen day of a new world: Kiln 30, Ochre 45, Tempest 120, Vesper 160, Glim 200, each within 3 days. Vagrant's orbit is too eccentric for a Hohmann window. A new world has somewhere to go within its first months.
4. **`BodyDefinition.appearance`** (optional, SDK), so the look is data that any mod can use:
   - `palette`: one to six sRGB colours, the first the main one.
   - `pattern`: `mottled`, `polar-caps`, `lineae`, `volcanic` or `bands`.
   - `sky` and `haze`: the colour of the light in the body's air, and dust or smog in it.
   - `clouds`: a deck at an altitude.
   - `rings`: inner and outer radius, colour and opacity.

   Without `appearance`, a body looks as before. The pattern is a closed set because the renderer draws it, as `terrain.kind` is (ADR 0121).
5. **Rendering adds no new large shader.**
   - The renderer bakes each body's palette and pattern into a small equirectangular colour map on the CPU. The moon pass multiplies its regolith shade by that map (one texture fetch; Cinder gets a white map, so it looks exactly as before).
   - A giant is a Lambert sphere with its band map.
   - A cloud deck is a Lambert shell with a cloud map. It fades out as the camera sinks below it.
   - Rings are a ring mesh with a radial texture, a built-in material.
   - `sky` and `haze` set the Rayleigh weights and the Mie share of the moon pass's air. These are uniforms the shader already has.
6. **Moon-pass bodies away from Home build lazily.** A craters body outside the home system first draws as a Lambert sphere with its colour map. That is one pipeline shared by every body. Its moon pass (globe, patches, stones, air) turns on only when the body is near: it covers more than a few dozen pixels on screen, or the active vessel is in its sphere. Its pipelines are built then, not at world load. Cinder keeps today's behaviour and is warmed at load.
7. **Gameplay follows the data.**
   - Generic contracts already offer flybys of every planet.
   - The main line goes on after the Moon: to Ochre (flyby, landing), then a Tempest flyby.
   - The tech tree keeps its system-neutral milestones (`home`, `moon`, from the system audit), so it works in Sol worlds too: no node asks for a stock planet.
   - The Cinder transfer lesson's debrief and hint point at Ochre's window.
   - Discovery facts already roll for every body that is not a star, so the new bodies have theirs with no change.
   - The system art reads `appearance` (colours, bands and rings), so stock gets the right picture with no per-id hint.
8. **Old worlds gain the bodies.** A save lists the bodies it was made with, but loading checks only the bodies its vessels are in. A world made before this plan loads with the new bodies in their places at its time.

## Consequences

- An n-body world (ADR 0122) evaluates fifteen bodies instead of three, so its warp budget reaches a lower top warp. The rails themselves are unchanged.
- The first approach to a new body builds its moon-pass pipelines then. On Windows that is a hitch of the same size as Cinder's share of today's load, once per body per session. It happens in the body's sphere, usually long before the closest approach.
- A body's colour map is 512 × 256 RGBA, 0.5 MB per body. Eleven new maps total 5.5 MB of GPU memory.
- The hard-coded crater basin at the landing plain (+X) is drawn on every craters body, as it was for Cinder.
- Science regions on the new bodies are seeded cells, and on Tempest latitude bands. `biomes` stays Home's.
