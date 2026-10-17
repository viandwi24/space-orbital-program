# 0119 — The Sun at the root: the home body is named, the tilt is the home orbit's inclination, and saves carry their home

**Status:** accepted
**Date:** 2026-10-18
**Plan:** [122](../plans/122-sun-root-axial-tilt-seasons.md)
**Builds on:** ADR 0103 point 4 (a Sun at the root), ADR 0051 (spheres of influence), ADR 0141 (calendar on the root body), ADR 0145 (body rotation), ADR 0027 (planet pass, one sun), ADR 0050 (saves)

## Context

The stock system's root is the home planet, so "the first body" means home throughout the sim, the renderer and the client, and the renderer's sun is a fixed direction. Plan 122 puts a Sun at the root with the home planet orbiting it, so a year, seasons and a solar day exist. It must not change a flight in the home sphere (the ascent and the moon transfer stay within 1e-6), and old saves must resume.

## Decision

1. **The home body is named, not found.** The sim's home (`SimCore.root`, the body the sim is "on": terrain, the launch site, recovery, crew and milestones) is `options.body`, else the save's `home`, else the world's primary site's body (`sitesOf(info)[0].body`), else the first body without a parent. It is no longer the root of the tree. The worker's catalog tells the client the home id; the client keys the planet pass, the VAB body, the trip planner and the HUD to it instead of `bodies[0]`.
2. **Save format 6** adds `SimSave.home`. The 5 to 6 migration sets it to the save's `bodies[0]`, which was home in every earlier save. A save's vessels are relative to their sphere's body, so a format-5 save resumes in the new system with every vessel state unchanged.
3. **The stock Sun** (`stock.sun`) is a body with `star: true` (no surface, no atmosphere; the renderer draws it emissive) and an infinite sphere of influence. The home planet orbits it at 13.6 Gm (a year of 9.2 Ms, about 425 solar days); its sphere of influence becomes finite, about 84 000 km, well beyond the moon (11 800 km).
4. **Axial tilt is the home orbit's inclination (23.44°).** The home's pole stays the system +Y, so the frame of the home sphere, the launch site's rotation and the moon's equatorial orbit are what they were: nothing in the home sphere moves. The sun's declination seen from home then swings between +tilt and −tilt over the year. The orbit's node and phase are chosen so the sun direction at t = 0 is the old fixed one (declination 0.2 rad, the launch site sees it 30° up and rising), so a new world starts in the same daylight.
5. **The calendar moves to the root** (ADR 0141: it is read on the root): the Sun carries `calendar: { kind: 'fictional', home: 'stock.home' }`. The home keeps its rotation period (21 600 s, sidereal), so the solar day becomes 21 651 s and the world tick's day follows it.
6. **The renderer's sun comes from the star body**: each snapshot sets the sun direction to the star's position minus the home's, normalised; without a star body the fixed direction stays (mods and tests with one body). `SceneConfig.home` keys the planet pass, the environment, the site and the terrain bake to the home body; a star gets an emissive sphere, a cratered body the moon pass, others a plain sphere.

## Consequences

- A vessel can now leave the home sphere into the Sun's (the patched conics already allow it); the map's system scope frames the Sun's system.
- Plan 123 (real ephemerides) and 124 (Sol pack) build on a named home and a star body.
- A day-based rate written against 21 600 s (stock data, crew rest) reads 0.2 % long; they keep their constant until a plan that touches them reads the calendar.
