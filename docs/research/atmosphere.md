# Atmosphere constants and zod number checks

Checked 2026-10-16.

- International Standard Atmosphere at mean sea level: T = 288.15 K, p = 101 325 Pa, ρ = 1.225 kg/m³, specific gas constant of dry air R = 287.0528 J/(kg·K). Source: https://en.wikipedia.org/wiki/International_Standard_Atmosphere. The sim uses `R = 287.05` and `T0 = 288.15`, giving ρ = 101 325 / (287.05 · 288.15) = 1.2250 kg/m³ at the surface pressure of the home body (`packages/sim/src/constants.ts`).
- Zod 4: `POSITIVE_INFINITY` / `NEGATIVE_INFINITY` are no longer valid for `z.number()` (migration guide, https://zod.dev/v4/changelog); NaN was never accepted (the core command tests assert NaN and Infinity are rejected). `commandSchema` relies on this to keep non-finite numbers out of the sim.
