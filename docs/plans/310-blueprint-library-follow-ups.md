---
id: 310
title: "Blueprint Library follow-ups: labels, completeness checklist, thumbnail cache, career locks"
status: draft
owner: ""
depends: [285]
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 310 — Blueprint Library follow-ups

## Goal

The rest of ADR 0263 that plan 285 left:
- a detail panel with leader-line labels and the trip planner's verdict;
- the completeness checklist (RCS, antenna, power, parachutes, life support, heat shield);
- thumbnails cached in IndexedDB per blueprint version;
- career locks (a blueprint with locked parts opens read-only);
- the Library's tabs for saved designs and sub-assemblies.

## Context

- ADR 0263; plan 285's log and journal.

## Scope

**In:** the items above.
**Out:** moving the stock blueprints into the stock mod as data (they are built with the editor's operations; a generated-data step would be its own plan).

## Steps

1. Detail panel and labels (`Renderer.project`).
2. Checklist from the design's modules.
3. Thumbnail cache.
4. Career lock with `designLocks`.

## Acceptance criteria

- [ ] Unit tests for the checklist and the lock.
- [ ] `bun test`, `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/310-blueprint-library-follow-ups.md` written.

## Log

- 2026-10-21 — Drafted from plan 285's leftovers.
