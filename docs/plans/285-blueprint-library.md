---
id: 285
title: "Blueprint Library: defineBlueprint, one dialog for blueprints, designs and sub-assemblies, cards on a blue grid, filters, detail with labels"
status: draft
owner: ""
depends: []
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 285 — Blueprint Library: defineBlueprint, one dialog for blueprints, designs and sub-assemblies, cards on a blue grid, filters, detail with labels

## Goal

The empty-hangar text buttons are replaced by featured cards and a Library dialog with tabs, drawn cards, stats, filters, search and a detail panel with leader-line labels and a completeness checklist; blueprints are mod content.

## Context

- Research: `refs/part-visuals-and-blueprints/README.md` and `refs/part-visuals-and-blueprints/parts-tracker.md` (tracker IDs name the parts this plan delivers).
- ADRs: 0263
- Code: `packages/renderer/src/parts/generators/`, `mods/stock/src/parts/`.

## Scope

**In:** SDK `defineBlueprint`, stock learn blueprints from today's five examples (completed with chutes, antenna and battery), Library UI, thumbnail cache, labels, checklist, career lock.
**Out:** Real-rocket blueprints (286, 287).

## Design notes

Per ADR 0263; the blue grid is CSS behind a transparent render.

## Steps

1. SDK and loader.
2. Stock learn blueprints.
3. Library dialog and empty-hangar card.
4. e2e.

## Acceptance criteria

- [ ] e2e: open the Library, filter "moon", load a blueprint, it launches.
- [ ] A mod-defined blueprint appears under "Mod" (test with the sample mod).
- [ ] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.
- [ ] Screenshots of every new or remodelled part (catalogue icon and in the Hangar) in the journal, before and after.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/285-blueprint-library.md` written.
- [ ] Affected `docs/architecture/*.md` updated to match what shipped.
- [ ] New ADRs written for any decision made here, linked above.
- [ ] `docs/research/stack-versions.md` updated for anything looked up.
- [ ] `refs/part-visuals-and-blueprints/parts-tracker.md`: status column of every tracker ID this plan delivers.

## Log

- 2026-10-21 — Drafted from the part-visuals research and the owner's decisions of 2026-10-21 (CTO calls delegated by the owner). Not to be started until the owner releases the parts work: on 2026-10-21 main is busy with renderer fixes and a UI/UX agent.
