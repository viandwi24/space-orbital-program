---
id: 124
title: "The real solar system pack ("Sol"): 1:1 and rescaled, balanced per scale"
status: in-progress
owner: "Agent 3"
depends: [123, 092, 071]
phase: 8
created: 2026-10-17
updated: 2026-10-18
---

# 124 — The real solar system pack ("Sol"): 1:1 and rescaled, balanced per scale

## Goal

A Sol mod package (in the repo, SDK only) offers the real solar system in two scale variants, `1:1` and `rescaled`, with real dates, tilts and rotation, Earth as home with sites from templates, each variant with a balance profile of typed patches; Create World explains each variant's difficulty; a headless validation suite per variant proves that stock reference rockets reach orbit, reach the Moon, survive re-entry and keep a link.

## Context

- ADRs: 0103, 0104
- Read: ADR 0103 points 6 and 7, ADR 0104 (patches), plans 123, 092 (templates), draft 071 (atmospheres on later bodies).
- Look up and record IAU rotation elements (WGCCRE) and body constants used, with URL and date, in `docs/research/ephemerides.md`.

## Scope

**In:**
- Core and SDK: `defineSystemVariant({ id, system, variant, label, description, home, facts, patches })`. `loadPlugins(plugins, { system, variant })` keeps only the chosen system's bodies (a plugin that declares variants owns its bodies; every other plugin's bodies belong to the stock system) and applies the variant's patches with the other patches. `createSim` passes the world's `systemId` and `variant`, and falls back to the variant's `home` when the world has no site on a loaded body. `rotation.epoch: 'j2000'` puts a body's spin on the J2000 axis (the sim shifts `w0` by the world epoch).
- `mods/sol` (SDK only):
  - bodies: the Sun, the eight planets (JPL Level A `kepler-rates`) and the Moon (the Almanac series in the J2000 ecliptic), with IAU 2015 poles and prime meridians turned into the J2000 ecliptic;
  - the Earth with the hills terrain and an atmosphere, `gregorian-utc`, site templates for real-like launch latitudes;
  - variants `1:1` and `rescaled`. Rescaled has sizes ×1/4, masses ×1/16 (surface gravity kept) and distances ×(1/4)^(2/3), so every period, date and angle stays real; its scale patches are computed by the pack;
  - per-variant balance patches on stock parts (engine efficiency, tank dry mass, heat shield, a long-range probe antenna);
  - a reference rocket and a capsule design per variant.
- Validation suite per variant (headless, `packages/scripting/test/sol-validation.test.ts`, since it needs the sim and the ascent script):
  - the reference rocket reaches a stable orbit above the atmosphere;
  - a transfer reaches the Moon's sphere;
  - a capsule from orbit comes down with no part over its temperature limit;
  - the home station links to a lunar orbiter for the stated share of time;
  - the date shows the right Sun declination and Moon phase.
- Create World: a system choice (stock or Sol) and, for Sol, the variants with their Δv to orbit and Earth–Moon transfer time from the pack data.

**Out:** real topography, minor bodies, DE440 (125), atmospheres of planets other than the Earth (they come with their own plan), scripts' and the planner's use of the path models (they keep reading the mean conic, ADR 0183 point 7).

## Touches

- **Size:** L
- **Edits:** `mods/sol` (new), `packages/sdk`, `packages/core`, `packages/sim`, `packages/scripting/test`, `apps/web/src/lib/worlds`, `apps/web/src/lib/catalog.ts`
- **Shared contracts:** **SDK (`defineSystemVariant`, `rotation.epoch`), loader option `{ system, variant }`**; new in-repo mod package

## Design notes

A variant whose suite fails is not offered in Create World (ADR 0103 point 7).

## Steps

1. Research and record.
2. Bodies and frame.
3. Variants and balance patches.
4. Validation suite.
5. Create World texts.

## Acceptance criteria

- [ ] `bun test packages/scripting/test/sol-validation.test.ts`, per variant: the reference rocket under the ascent script reaches a stable orbit above the atmosphere; a transfer from that orbit enters the Moon's sphere; a capsule from orbit lands with no part over its limit; the home station links to a lunar orbiter for at least the share stated in the pack.
- [ ] `bun test mods/sol`: the Sun's declination and the Moon's elongation on stated dates match the reference (Horizons, `docs/research/ephemerides.md`) within the sources' stated accuracy; both variants load and their patches apply.
- [ ] `bun test packages/core` and `packages/sim`: the loader keeps one system's bodies, applies only the chosen variant's patches, and a Sol world starts at its variant's home.
- [ ] vitest: Create World lists Sol's variants with the Δv to orbit and the transfer time from the pack data.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/124-real-solar-system-pack-scales.md` written.
- [ ] `guides/writing-a-mod.md` (systems and variants), `product/spec.md` scope line, `architecture/plugin-system.md`.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0103, 0104).
- 2026-10-18 — Refined and claimed by Agent 3. The loader picks one system per world. The rescaled variant keeps surface gravity and every period real (sizes ×1/4, masses ×1/16, distances ×(1/4)^(2/3)). The balance is patches on stock parts. The validation suite lives in `packages/scripting/test` because it needs the sim and the ascent script. Planet atmospheres other than the Earth's are out. Sources are in `docs/research/ephemerides.md`. Design choices go in ADR 0184.
