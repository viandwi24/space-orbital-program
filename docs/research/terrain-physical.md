# Research: physical terrain (plan 031)

Checked 2026-10-17 (three 0.186.x, Rapier compat build as in `rapier.md`).

| Topic | Fact | Source |
|---|---|---|
| Rapier heightfield collider | `ColliderDesc.heightfield(...)` exists for 3D (rows are subdivisions along Z, columns along X, plus a `scale` for the rectangle in the X-Z plane); the guide says triangle meshes and heightfields are "generally suited to fixed environments", and that collision detection between two non-dynamic bodies (kinematic vs fixed) is off by default (`ActiveCollisionTypes.KINEMATIC_FIXED` turns it on). The prose and the example differ in the argument list, so the API reference has to be checked before use. We do not use it: a planar patch around a moving vessel would be rebuilt every step; the tile (a kinematic box whose top plane is fitted to the terrain, ADR 0043) keeps ADR 0019's machinery. | https://rapier.rs/docs/user_guides/javascript/colliders/ (2026-10-17) |
| Geometry clipmaps | Nested regular grids centred on the viewer, finer near, coarser far; each level a window of n x n samples (n typically 255) that shifts with the viewer by toroidal addressing; coarser levels update less often; near a level's outer edge the fine height is blended linearly to the coarser height so there is no popping; elevation is stored in a floating-point texture whose integer part is the fine height and whose fractional part is the difference to the coarser level (one lookup reads both) - the model for our hi/lo split and for the two nested patches. | https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry (2026-10-17) |
| WebGL 2 float textures | RGBA16F is colour-renderable with `EXT_color_buffer_float` (or `EXT_color_buffer_half_float`); RGBA32F only with `EXT_color_buffer_float`; linear filtering of 32-bit float textures needs `OES_texture_float_linear`; linear filtering of 16-bit float textures is core in WebGL 2. The MDN page fetched documents the extension mechanism (`getExtension` returns null if unsupported) and the extension names, but not the WebGL 2 format table: the 16-bit filtering fact is from the WebGL 2 / OpenGL ES 3.0 specification and is exercised by the cube bake since plan 027. | https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Using_Extensions (2026-10-17) |
| Volumetric clouds (for the draft) | Schneider, "The real-time volumetric cloudscapes of Horizon: Zero Dawn" (SIGGRAPH 2015): targets 2 ms GPU on the console of the day; the Guerrilla page is only an abstract that links to the slides (ray-march a low-resolution noise volume, light march toward the sun, temporal reprojection are from the slides, not confirmed by the page fetched), so the draft plan carries the details as work to verify. | https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn (2026-10-17) |

## Measurements (own scratch scripts, 2026-10-17, Bun, the plan-027 height function)

Bilinear interpolation of the height function on a regular grid against the analytic function, 22 500 random points in a 6 km square, centred 25, 30 and 40 km from the site (the scenic massif). Maximum / mean error in metres:

| Texel | 25 km | 30 km | 40 km |
|---|---|---|---|
| 920 m (cube at `high`) | 74 / 13.6 | 88 / 19.9 | 124 / 27.0 |
| 230 m | 19 / 1.3 | 29 / 1.9 | 33 / 2.4 |
| 64 m | 5.9 / 0.11 | 8.7 / 0.17 | 7.5 / 0.20 |
| 16 m | 1.0 / 0.007 | 1.9 / 0.011 | 2.1 / 0.013 |
| 8 m | 0.50 / 0.002 | 0.77 / 0.003 | 0.99 / 0.004 |
| 4 m | 0.33 / 0.000 | 0.42 / 0.001 | 0.37 / 0.001 |

The residual at 4 to 16 m is the crease of the ridge `abs` (unbounded curvature); ADR 0043 softens it. These numbers are why the visual surface needs patches (ADR 0044) and why the half-float height of the old bake (2 m steps above 2 048 m) is not enough.

After plan 031's changes to the function (soft ridge, smooth maximum, closer massif) the same measurement gives, maximum error in metres over 3 x 3 000 points: 4 m grid 0.003 to 0.04, 32 m grid 0.07 to 1.8 before the smooth maximum and under 1 afterwards; the GPU bake against float64 (400 texels read back in the built-in browser, journal 031): fine patch 0.03 m mean and 0.20 m worst, mid patch 0.045 m and 0.81 m.

## WebGL facts found in the browser run (2026-10-17, Chromium in the Claude desktop app, ANGLE Metal, Apple M5)

| Topic | Fact |
|---|---|
| Filtering `hi` + `lo` half floats | Filtered in half precision: heights near 900 m err by up to 0.5 m at the places where `hi` steps by 16 m (contour-line cracks). Patches therefore use RGBA32F. |
| `OES_texture_float_linear` | Present here; `gl.extensions.get('OES_texture_float_linear')` enables it in three; without it the shader filters four `texelFetch` by hand. |
| GLSL reserved words | `patch` is reserved in GLSL ES 3.00 (a parameter named `patch` failed the whole planet pass compile) - already noted in `three.md` for plan 025. |
| float32 at 600 km | `length(p) - R` quantises to 6 cm; the clearance of a march sample must be expanded from the camera (`(|p|^2 - R^2) / (|p| + R)`). |
