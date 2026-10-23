---
id: 377
title: "Space Center tour: a welcome offer per world and an interactive stepper on the guide card"
status: in-progress
owner: "lessons session (Claude)"
depends: [344, 273, 349]
phase: 0
created: 2026-10-23
updated: 2026-10-23
---

# 377 — Space Center tour

## Goal

The first visit to a world's Space Center offers a short tour; the tour waits for each real action (camera, Build, place, warp, Buildings, visit, upgrade, demolish, branch) on the guide card with a highlight on its target, works in Sandbox and Career, and costs the player nothing.

## Context

- Owner (2026-10-23): "bisa ngga kita bikin tutorial atau stepper itu buat diawal? jadi pas membuka world baru pertama kali ada popup dulu diawal mau tutorial atau engga. tutorial di space center dulu aja, kaya build hangar, build antena, dll. terus berkunjung ke buildingnya, terus demolish, dll."
- Plan 344 (guide card, `GuideFrame`, `GuidePointer`, lesson step machine), plans 273/349 (Space Center modes, Build strip, Buildings strip), plan 096 (construction cost and days), plan 236 (branches).
- Removing a building refunds nothing (`removeBuilding`); placing and upgrading pay at once with the economy on.
- ADR **0314** (this plan).

## Scope

**In:** the tour's steps and step machine (`onboarding/sc-tour.ts`), its runner and card in the world layout, the Space Center's feed (overlay mode, build state, selection, buildings, camera use), the welcome modal (Start the tour / Skip / Don't ask again) remembered per world, "Space Center tour" in the world menu, `place-building.tour` with the building's `refund` (core, sim), tests.
**Out:** a Flight tour (the lessons cover it); e2e.

## Steps

1. ADR 0314, this plan.
2. Core and sim: the tour flag, the refund on removal; bun tests.
3. The tour model and step machine; the Space Center feed; the runner and card with Back, Skip, Next; the welcome modal; the world menu entry.
4. Tests: step machine, each completion condition, every step's target exists.
5. Screenshots, docs, commit and push in pieces.

## Acceptance criteria

- [ ] `bun test packages/sim`: a tour building placed and upgraded with the economy on is refunded in full when removed; an ordinary one is not; the flag changes nothing with the economy off.
- [ ] Web vitest `src/lib/onboarding/sc-tour.test.ts`: each step completes only on its own observation, in order; Back reviews without skipping ahead; every step's target test id exists.
- [ ] The welcome modal shows on a world's first Space Center visit, not again after a choice, and the world menu restarts the tour (screenshots).
- [ ] `bun run typecheck`, `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` board row.
- [ ] `docs/journal/377-space-center-tour.md`.
- [ ] ADR 0314 in the index.

## Log

- 2026-10-23 — Plan written in the lessons session.
