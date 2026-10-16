# 0030 — Launch-site coordinates are body-fixed; ground detail without terrain geometry

**Status:** accepted
**Date:** 2026-10-16
**Plan:** plans/025-environment-follow-ups.md

## Context

Plan 019 left two things open (journal 019, ADR 0027 item 11). First, `placeOnSurface` used an *inertial* latitude/longitude, so a vessel loaded after the planet had turned for about 1 s stood roughly 160 m off body-fixed (0, 0), and the renderer had to infer the launch site from the first vessel. Second, the ground between 1 and 20 km was a painted map, the lawn at the pad was noise colour, the coastline seen from orbit was speckle, and the launch site was boxes. Physics keeps a sphere with a flat ground tile (ADR 0019); terrain heights and LOD are Phase 3.

## Decision

1. **`placeOnSurface(latitude, longitude)` takes body-fixed coordinates.** The inertial up vector is the body-fixed one rotated about +Y by `omega * t` (`qAboutY`), so the vessel stands on the same ground spot whenever it is loaded and co-rotates from the first step. `createSim`, the protocol and `VesselPlacement` are unchanged (same fields, the meaning is now the documented one). The renderer deletes the inference (`SceneModel.lockLaunchSite`, `LAUNCH_SITE_MAX_ALTITUDE`); `launchSite` in `RendererConfig` stays for hosts that load somewhere else. This supersedes item 11 of ADR 0027.
2. **Relief is shading only.** The planet pass shades hills and valleys from finite differences of a few noise octaves (`macroRelief`) beyond 500 m of the pad, fading in by 2.5 km and out above a 160 m pixel footprint; amplitude per octave falls with wavelength (`lam^1.5`) so slopes stay plausible. Nothing moves vertices: physics, the pad, trees and buildings stay on the reference sphere, so vessels cannot float or sink. Silhouettes of mountains are not drawn (a Phase 3 item).
3. **Coasts scale with the map gradient.** Detail displaces the shoreline by a fraction (0.7) of the octave wavelength divided by the local map elevation gradient, instead of a fixed elevation offset, which removes the speckle seen from orbit; the land/sea edge is antialiased by the pixel footprint. Foam, a wet-sand band, rivers (level sets of a low-frequency field on lowland, width and visibility from the pixel footprint), field plots with hedges and forest crowns are shader detail with footprint cut-offs.
4. **Near-ground vegetation is geometry.** 9 grass blades per tuft, instanced (`tufts` in the preset table: 0 / 16 000 / 42 000), wind bend and distance shrink in the vertex shader; trees, shrubs and rocks are instanced with per-instance colour and wind; foliage has a leaf-scale albedo patch. The grass albedo of the ground shader and of the tufts are matched so the join is invisible.
5. **Launch-site art stays procedural but is built from separate modules** (`site-buildings.ts`, `site-vegetation.ts`, `site-geo.ts`) into one mesh per material; a weathering patch of `MeshStandardMaterial` (`weathering.ts`) gives streaks, grime, rust and roughness variation without textures. Thin steel (masts, poles, fences, cables) never casts shadows: a 10 cm mast produced hairline shadows across the grass at low sun (found in 019's screenshots).
6. **Night**: four point lights at the mast floodlight banks (intensity 0 by day so the shader never recompiles at dusk) and the same four lamps as a term in the ground shader; both fade in with the sun below 3 degrees.

## Alternatives considered

- **Keep the heuristic and add a snapshot field** — the vessel would still be placed 160 m off its nominal site and every consumer would need the field. Fixing the placement is smaller.
- **Tessellated terrain with a heightmap now** — needs physics ground changes (ADR 0019), LOD and seams; recorded in draft plan 025's remaining items.
- **Analytic derivatives of the noise instead of finite differences** (Quilez, iquilezles.org/articles/morenoise) — cheaper and exact; the lattice noise here is hash-based with an integer anchor (ADR 0027 item 4), so it needs its own derivative form. Left as an optimisation.
- **Billboard or atlas grass** — cannot be lit like the ground and swims with parallax at 2 m camera height.

## Consequences

- Sim: new tests (`launch-site.test.ts`); existing sim tests pass unchanged. A mod or script that relied on the inertial meaning of the longitude would be 160 m off per second of sim time at load; none exists.
- Renderer cost grows (journal 025): tufts and richer buildings add triangles, the ground shader adds relief, river and field branches that are skipped far from them. Frame times are in the journal.
- The point lights add four lights to every lit material; intensity 0 by day.
