---
id: 092
title: "Site choice at world creation and location templates"
status: draft
owner: ""
depends: [084, 087, 090]
phase: 5
created: 2026-10-17
updated: 2026-10-17
---

# 092 — Site choice at world creation and location templates

## Goal

Create World lets the player choose the primary site on a globe or from location templates (for example equatorial coast, mid-latitude coast, inland plateau, high latitude, island), each resolved against the world seed to a concrete flat spot, with its consequences shown (rotation boost, lowest inclination, downrange over sea or land, nearest recovery); in Career a second site can be founded later.

## Context

- ADRs: 0097
- Read: ADR 0097 point 6, `refs/reverse-engineering-ksp2/beyond/08-space-center-building-and-colonies.md` §4 (git-ignored; the consequences listed above are computed from the existing sim).

## Scope

**In:**
- `defineSiteTemplate({ id, label, criteria })` with stock templates; a resolver that searches the seeded terrain for the best spot (coast direction, flatness, latitude band).
- Globe picker in Create World (a 2D map projection is acceptable) with the consequences panel.
- Founding an additional site: a command that creates a site with a starter layout; cost and time arrive with 096 (free in Sandbox).
- Abstract transfer of vessels and crew between sites (time and cost fields; zero until 095).

**Out:** range safety (127), bases on other bodies (128).

## Touches

- **Size:** M
- **Edits:** `packages/core`, `packages/sdk`, `mods/stock`, `apps/web/src/routes/worlds`, `packages/sim`
- **Shared contracts:** **SDK (`defineSiteTemplate`), protocol (`found-site`)**

## Design notes

The resolver is deterministic from the seed so the same world gets the same spot; its search cost is bounded (a coarse grid then refine) and measured.

## Steps

1. Templates and resolver with tests.
2. Consequences maths (rotation boost from latitude, minimum inclination, downrange classification).
3. Globe picker UI.
4. Found-site command.

## Acceptance criteria

- [ ] `packages/core` test: for 20 seeds every stock template resolves to a spot whose flat-zone height variance is under 1 m and whose latitude is inside the template band; the same seed gives the same spot.
- [ ] `packages/core` test: the rotation boost of a site at latitude φ equals ω R cos φ within 1e-9 (stock body).
- [ ] vitest: choosing a template in Create World shows its consequences and the created world's first site has the resolved coordinates.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/092-site-choice-and-location-templates.md` written.
- [ ] `guides/writing-a-mod.md` (site templates).
- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097).
