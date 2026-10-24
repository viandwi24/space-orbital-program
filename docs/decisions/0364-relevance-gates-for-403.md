# 0364 — Relevance gates on the looks of plans 403, 405 and 406

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/403-planets-from-orbit.md
**Builds on:** ADR 0361 (bakes of other bodies), ADR 0363 (a mod planet from far), the roadmap brief's "Graphics and playability together"

## Context

The owner found that the graphics work made the game less playable and corrected the order: looks continue, but each is paid for only where the view needs it, nothing compiles or reallocates during play, and each is measured on and off. ADR 0361 and ADR 0363 had gates by size on screen only.

## Decision

1. **The far cloud shell is gated by altitude** (`CLOUD_FAR_GATE`, 12 to 30 km, in both shader twins): it is multiplied into `farK`, so below 12 km the near march alone draws the clouds, as before plan 403, and the shell's baked-map read and its light are skipped by their own branch; above 30 km, over the slab, it is full.
2. **Home's baked faces are 2048 only where the tier pays for them** (`scaledSpaceCap`, `scaledCapFor`): the M5-class tiers (`m5`, `discrete-high`, and `apple` on a 120 Hz display, since Chrome hides the chip); every other machine, and any machine not yet known, keeps 1536 (and Medium 1024, Low 512). The host sets the cap when it probes the GPU and again when the refresh rate is measured; a bake of another size is taken at once. This is 268 MB of GPU memory only where it is paid for.
3. **Bakes never run under the player's hands**: `holdBakes(ms)` (the flight loop calls it on every key press, 1.5 s) stops `BodyBakes` from starting a job and from taking in a finished map (it waits, then lands when the hold ends), and stops the dress's own slice of palette baking on the main thread. The bake itself is in a worker (or in 4-row slices where there is none).
4. **No compile during play**: the far sphere's Lambert material always carries a normal map (a shared flat 1 x 1 one), so a mod's relief swaps a texture and never the program; the sea's colours, the air coefficients and the weather look are uniforms; the bake uploads a texture. The shell and the sea add no shader variant.
5. **Measured on and off** (journal 403): the same scenes with the parts off (the build before plan 403's second stage) and on.

## Consequences

- A base M2 or a mid-range Windows machine never allocates the 2048 faces and does not draw the shell below 12 km.
- Above 12 km and below 30 km the horizon's clouds fade between the two, as the shell does not exist at ground level any more: the horizon beyond 120 km loses its clouds below 12 km, as it did before plan 403.
