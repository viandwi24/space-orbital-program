# 0184 — Systems and scale variants: selection in the loader, variant patches, J2000 rotation, the Sol pack

**Status:** accepted
**Date:** 2026-10-18
**Plan:** 124
**Builds on:** ADR 0103 points 6 and 7 (Sol, scale variants, balance and validation), 0104 and 0170 (patches), 0110 (the world's `systemId` and `variant`), 0145 (pole times spin), 0183 (path models), 0142 (sites).

## Context

Every registered body is in every sim. A second system (Sol) next to stock would put two Suns in one world. A world already records `systemId` and `variant` (ADR 0110), but nothing reads them. Open: who owns which bodies, where a world's system is chosen, how a variant scales bodies and balances parts, how a body's spin follows real dates, which scale the rescaled variant uses, and where validation runs.

## Decision

1. **Systems are declared by variants.** `defineSystemVariant({ id, system, variant, label, description, home, facts, patches })`:
   - `system` is the declaring plugin's id;
   - `home` is the body a world without a site on a loaded body starts on;
   - `facts` is `{ dvToOrbit (m/s), moonTransfer (s), notes? }`, data for Create World;
   - `patches` are ordinary patch definitions (ADR 0170).

   A plugin that registers a variant owns its bodies as a system. Every other plugin's bodies belong to the stock system, so a mod that adds a moon to stock keeps working.
2. **The loader chooses.**
   - `loadPlugins(plugins, { system: { id, variant } })` removes, before patching, the bodies of every declared system except the chosen one; for `stock`, it removes all declared systems' bodies.
   - It registers the chosen variant's patches as if their plugin had, so they order, validate and report like any patch.
   - Without the option, all bodies stay, as before (tools, tests, the parts catalogue).
   - `createSim` passes the world's `systemId` and `variant`.
   - The home is the asked body, else the save's, else the primary site's body if loaded, else the variant's `home`, else the root.
3. **J2000 spin.** `rotation.epoch: 'j2000'` measures `w0` and the periodic phases at J2000 TDB. The sim's body runtime shifts them by the world epoch (`w0 += wDot · offset`), so every consumer of the sim's bodies sees world time. Other code reading the raw definition gets the spin rate right and the phase as at J2000.
4. **The Sol pack** (`mods/sol`, SDK only):
   - **Bodies:** the Sun, the eight planets with JPL Level A `kepler-rates` paths, and the Moon with the Almanac series. The series' longitude rate is less the general precession, so it is in the J2000 ecliptic like the planets.
   - **Constants:** masses, mean radii and rotation from JPL and the IAU 2015 report (`docs/research/ephemerides.md`).
   - **Poles and prime meridians:** turned from ICRF into the J2000 ecliptic. `w0` is chosen so that the body-fixed +X axis is the IAU prime meridian.
   - **The Earth:** the `hills` terrain (no real topography) and an atmosphere of 101 325 Pa with an 8.5 km scale height, 100 km tall. The other planets have no atmosphere yet.
   - **Calendar** `gregorian-utc`.
5. **Variants.**
   - **`1:1`:** real sizes, about 9.4 km/s to low orbit.
   - **`rescaled`:** sizes ×k, masses ×k² and distances ×k^(2/3), with k = 1/4. Surface gravity, every orbital period, every date and every angle stay real, and the Earth is 1 593 km across, 2.65 times stock's home. Its atmosphere is ×½ in scale height and height. The pack computes the scaled numbers and ships them as `set` patches on its own bodies.
   - **Balance patches on stock parts:** engine efficiency, tank dry mass, heat-shield tolerance, and a long-range probe antenna. The values are fixed by the validation suite's measurements.
6. **Validation** runs headless in `bun test` per variant (`packages/scripting/test/sol-validation.test.ts`):
   - the pack's reference rocket under the ascent script reaches a stable orbit above the air;
   - a transfer from it enters the Moon's sphere;
   - a capsule from orbit lands with no part over its limit;
   - the home station links to a lunar orbiter for the stated share of time.

   The date checks (Sun declination, Moon elongation) run in `mods/sol`. A variant whose suite fails is not registered (ADR 0103 point 7).
7. **Create World** offers the system (stock, Sol) and, for Sol, its variants with `facts`.

## Alternatives considered

- **Filtering bodies in the sim only:** rejected. The host, the renderer and the planner read `sim.registries`, which would still list both systems.
- **A multiply op for patches:** rejected for now. The pack knows its own bodies and computes the scaled values, and the patch format stays as ADR 0170 left it.
- **The rescaled variant with sizes and distances on one factor:** rejected. It keeps neither periods nor surface gravity, and the Moon's real phases would no longer match its orbit.

## Consequences

- **Mod API:** `defineSystemVariant`, `rotation.epoch`, load option `system`; additive, `API_VERSION` patch bump. Load-report kind `system-variant`.
- **Behaviour:** stock worlds lose nothing. Bodies of a declared system no longer appear in them, and none existed before.
- **Follow-ups:** atmospheres on other planets, minor bodies, DE440 (125), scripts and the planner on the path models, real topography.
