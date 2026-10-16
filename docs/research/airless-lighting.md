# Lighting an airless body

Checked 2026-10-17 (plan 049).

- Earthshine at the lunar surface averages about 0.15 W/m2, roughly one ten-thousandth of the sunlight there; it dominates only during lunar night. Source: https://arxiv.org/pdf/1904.00236 (Earthshine as an Illumination Source at the Moon); also https://www.timeanddate.com/astronomy/earthshine.html.
- The moon's mean albedo is about 0.12 (crushed rock and glass regolith). Source: the same search, several astronomy pages (e.g. https://astrosociety.org/news-publications/mercury-online/mercury-online.html/article/2020/01/22/by-the-light-of-earth-moon-mysteries-shine). The moon pass uses a linear albedo of 0.135 (`moon.ts`), which the bounce term follows.
- three.js (r155 and later): light intensities are physical; a `DirectionalLight` is an illuminance, a white Lambert surface facing it reflects `intensity / PI`; `scene.environment` is added to the direct light and is independent of it. Source: https://threejs.org/docs/#api/en/lights/DirectionalLight (the index page; the behaviour is the repo's own ADR 0027 convention, confirmed by the PBR calibration in `atmosphere-model.ts`).

What follows for the renderer: with no air the only strong light is the sun, plus the sun bounced off the ground (albedo times the sun's irradiance times the sine of its elevation, over PI), so a vessel's shadow side is lit by the regolith below it. Planetshine is physically about 1e-4 of the sun; the renderer uses 1.2e-2 as a legibility floor (ADR 0058) so a shadow side is dark but readable.
