---
id: 124
title: "The real solar system pack ("Sol"): 1:1 and rescaled, balanced per scale"
status: draft
owner: ""
depends: [123, 092, 071]
phase: 8
created: 2026-10-17
updated: 2026-10-17
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
- `mods/sol` package: bodies (Sun, planets, Moon; minor bodies out), `timeScale: TDB`, `calendar: gregorian-utc`, J2000 ecliptic frame.
- `defineSystemVariant` for `1:1` and `rescaled` (size and distance factors; the rescale factor fixed here from measurements of the validation suite).
- Balance profiles as patches (engine thrust and efficiency, tank ratios, heat shields, antenna power and comms scale, recovery, contract rewards).
- Earth terrain from the existing generator with a seed (no real topography), site templates for real-like locations (coast, latitude bands).
- Validation suite in `bun test` per variant.

**Out:** real topography, minor bodies, DE440 (125).

## Touches

- **Size:** L
- **Edits:** `mods/sol`, `packages/sdk`, `packages/core`, `apps/web/src/routes/worlds`, `mods/stock`
- **Shared contracts:** **SDK (`defineSystemVariant`)**; new in-repo mod package

## Design notes

A variant whose suite fails is not offered in Create World (ADR 0103 point 7).

## Steps

1. Research and record.
2. Bodies and frame.
3. Variants and balance patches.
4. Validation suite.
5. Create World texts.

## Acceptance criteria

- [ ] `mods/sol` test per variant: a stock reference rocket under the stock ascent script reaches a stable orbit above the atmosphere; a stock transfer reaches the Moon's SOI; a capsule returns without exceeding part temperatures; the home station keeps a link to a lunar orbiter for the stated share of time.
- [ ] `mods/sol` test: the Moon's phase and the Sun's declination on a stated date match the reference within the research source's stated accuracy.
- [ ] vitest: Create World shows each variant's Δv to orbit and transfer time from the pack data.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/124-real-solar-system-pack-scales.md` written.
- [ ] `guides/writing-a-mod.md` (systems and variants), `product/spec.md` scope line.
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0103, 0104).
