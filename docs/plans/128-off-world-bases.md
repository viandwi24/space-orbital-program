---
id: 128
title: "Off-world bases: base kits and parts left on the surface"
status: draft
owner: ""
depends: [096, 092, 082]
phase: 9
created: 2026-10-17
updated: 2026-10-17
---

# 128 — Off-world bases: base kits and parts left on the surface

## Goal

A base can be founded on another body in two ways: a base kit lands and deploys, opening a site with plots and a catalogue filtered by the body; or a landed vessel is made a member of a site (an outpost), keeps working on the world tick, and can drive away again. One commodity chain (for example ice to water to propellant) and one supply route are the first slice.

## Context

- ADRs: 0097, 0098
- Read: ADR 0097 point 7, ADR 0098 (commodities), `refs/reverse-engineering-ksp2/11-colonies-resources-interstellar.md` and `beyond/08-space-center-building-and-colonies.md` §5 (git-ignored).

## Scope

**In:**
- Base kit part and deploy action; site creation on another body with a flat zone (terrain kinds `craters` and `hills`).
- Building catalogue filtered by body rules.
- Outposts: membership command for landed vessels; background operation of their modules.
- One ISRU recipe and site storage; one abstract supply route repeating a proven flight on transfer windows.
- Sankey-style flow panel in the Space Center for the base.

**Out:** colonies with population, interstellar.

## Touches

- **Size:** L
- **Edits:** `packages/core`, `packages/sim`, `mods/stock`, `packages/renderer/src`, `apps/web/src/routes/space-center`
- **Shared contracts:** **save (sites on other bodies, members), SDK (body building rules)**

## Design notes

Off-world sites reuse the Space Center screen with the body's ground pass.

## Steps

1. Base kit and site creation.
2. Outpost membership.
3. ISRU chain and storage.
4. Supply route.
5. UI.

## Acceptance criteria

- [ ] `packages/sim` test: a deployed base kit on the moon creates a site whose flat zone appears in the moon's height function.
- [ ] `packages/sim` test: a landed vessel made an outpost runs its drill on the world tick and stops when it drives off.
- [ ] `packages/sim` test: the supply route delivers its cargo on each window and books its cost.
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/128-off-world-bases.md` written.

- [ ] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0097, 0098).
