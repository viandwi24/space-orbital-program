---
id: 034
title: "VAB extras: mod-supplied categories, trip planner, mod lift modules in the stability read-out"
status: draft
owner: ""
depends: [029]
phase: 3
created: 2026-10-17
updated: 2026-10-17
---

# 034 — VAB extras

## Goal

What plan 029 pushed out because it needs an SDK or sim change.

## Context

- Read: `docs/plans/029-vab-follow-ups.md`, ADR 0033 (module descriptors), 0042 (stability read-out), `apps/web/src/lib/editor/categories.ts`, `apps/web/src/lib/editor/stats.ts`.

## Scope

**In (candidates, to be ordered at refinement):**
1. **Mod-supplied category and sort order** on the part definition (SDK change, ADR, API bump) so third-party parts group properly in the catalogue; stock moves to it.
2. **Trip planner**: more targets than "low orbit" (the Mun-like moon, escape), per-body gravity and atmosphere losses from a quick simulation instead of the 1.3 km/s allowance.
3. **Mod lifting surfaces in the stability read-out**: a lift field in module descriptors (ADR 0033) so a mod's wing counts in the centre of pressure.

**Out:** anything in plan 029.

## Steps

1. Refine with the human.

## Acceptance criteria

- [ ] To be written at refinement.

## Docs checklist

- [ ] STATUS, journal, ADR for the SDK change.

## Log

- 2026-10-17 — Created as draft by the vab-2 session (pushed out of plan 029).
