# 0069 — An ozone absorption layer in the atmosphere model, the sun-depth table and the shaders

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/054-light-shafts-and-ozone-sky.md

## Context

ADR 0027's atmosphere is Rayleigh plus Mie single scattering. With the sun at or under the horizon the sky it produces goes olive green (journal 054, `054-before-twilight.jpg`): sunlight that has crossed the atmosphere has lost its blue to Rayleigh scattering and what scatters toward the viewer is green and red. The real twilight sky stays blue to violet because the ozone layer absorbs the green and yellow of the Chappuis band (research `three.md`, "Plan 054"). Visual direction (`product/visual-direction.md`) asks for a warm horizon at a low sun; "warm" must not turn into green.

## Decision

1. **A third medium that only absorbs.** `Atmosphere.betaOzone` (1/m per channel at peak density), density a tent (`OZONE`: 0 at 10 km, 1 at 25 km, 0 at 40 km above the surface; absolute altitudes, not stretched like the Rayleigh layer), coefficients (6.5e-7, 1.881e-6, 8.5e-8) per metre at about 680, 550 and 440 nm, verified against Bruneton's cross sections times 300 Dobson units and Hillaire's published values (2026-10-17).
2. **Scaled for the planet.** The home body is 600 km across, a tenth of Earth: a slant path through a 15 km layer is about a third as long, so at sunset the ozone column is a quarter of Earth's. `OZONE_STRENGTH = 3.5` multiplies the density (vertical green optical depth 0.1, Earth 0.03), the same reasoning as `RAYLEIGH_THICKNESS`, applied to density rather than height. The existing haze tests (ADR 0037 and plan 039) stay green unchanged: ozone does not touch a path under 10 km (a test pins it) and the noon sky and sun stay within the tested 5 %.
3. **One more channel in the sun-depth table.** The baked table of plan 039 holds (Rayleigh, Mie, ozone, unused) as an RGBA half-float texture (64 kB instead of 32; the bake is still under 30 ms). The shader's `extinction` takes a `vec3` of the three depths, the march accumulates the ozone depth along the view ray (`ozoneDensity` is the GLSL twin of `ozoneDensity` in `atmosphere-model.ts`), the CPU twin (`columnDensity`, `integratePath`) does the same, so the sun and ambient colours the lights take from the model match the sky.
4. **Not adopted:** a separate twilight colour ramp painted on the sky (cheap, but it would not follow the camera's altitude, the sun's azimuth or the planet's size and would disagree with the lights, which read the model).

## Consequences

- Twilight and the terminator seen from orbit turn blue to violet instead of green or gold (journal 054, `054-*-twilight.jpg`, `054-*-term.jpg`); a sunset sky is a little more saturated (less green in the sun), a noon pad is unchanged to the eye.
- Cost: the march does one more multiply-add per sample and one more channel read of the same fetch; measured at 0.1 ms or less where no shafts run (orbit, `thr` 2.88 to 2.98 ms).
- Moons and airless bodies are untouched (no atmosphere); a mod body with a thinner atmosphere than 40 km gets the part of the tent below its top.
- The coefficients are for Earth's ozone; a body with a different composition would want its own (not needed: only the home body has air).
