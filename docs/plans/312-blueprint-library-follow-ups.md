---
id: 312
title: "Blueprint Library follow-ups: labels, completeness checklist, thumbnail cache, career locks"
status: draft
owner: ""
depends: [285, 346, 350]
phase: 0
created: 2026-10-21
updated: 2026-10-24
---

# 312 — Blueprint Library follow-ups

## Goal

The rest of ADR 0263 that plan 285 left:
- a detail panel with leader-line labels and the trip planner's verdict;
- the completeness checklist (RCS, antenna, power, parachutes, life support, heat shield);
- thumbnails cached in IndexedDB per blueprint version;
- career locks (a blueprint with locked parts opens read-only);
- the Library's tabs for saved designs and sub-assemblies.

## Context

- ADR 0263; plan 285's log and journal.
- ADR 0316 (commit 1df414aa, plan 379): stock owns the blueprints as data, baked from the Hangar's builders and read by id.
- Plan 380: a blueprint may have its own design per system. The in-memory thumbnail key in `apps/web/src/lib/vab/controller.svelte.ts` (`blueprintThumbnail`, about line 1921) is `id@system:variant`.
- Plan 346 (the vessel library on the Launch page: search, filter, sort, thumbnails) and plan 350 (the "Start a vessel" modal, which opens the Library or a saved vessel).
- `designLocks` is already used in `apps/web/src/lib/tech/world-tech.ts`, the controller and the Launch page.

## Scope

**In:** the items above.
**Out:** —

## Design notes

- The IndexedDB thumbnail cache key must include the system and variant as well as the blueprint version, as the in-memory key does.
- **Decide first:** the "My designs" tab overlaps plan 346's vessel library and plan 350's start modal. Reuse `lib/launch/vessel-library.ts` (dedupe, search, sort) for the tab rather than writing a second list; record the choice in the Log.

## Steps

1. Detail panel and labels (`Renderer.project`).
2. Checklist from the design's modules.
3. Thumbnail cache in IndexedDB, keyed by blueprint id, version, system and variant.
4. Career lock with `designLocks`.
5. The saved designs and sub-assemblies tabs, reusing plan 346's library.

## Acceptance criteria

- [ ] Unit tests for the checklist, the lock and the thumbnail cache key (a blueprint in two systems gets two entries).
- [ ] `bun test`, `bun run typecheck` and `bun run docs:check` pass.

## Docs checklist

- [ ] `docs/STATUS.md` updated (board row, next plan, open issues).
- [ ] `docs/journal/312-blueprint-library-follow-ups.md` written.

## Log

- 2026-10-24 — Rewritten by the coordinator after an audit against main @ 4c546c02: still valid; removed the stale Out line (stock owns the blueprints as data since 1df414aa, ADR 0316, plan 379); the thumbnail cache key must include the system (plan 380); noted the overlap of the "My designs" tab with plans 346 and 350; depends add 346, 350 and 379.
- 2026-10-21 — Drafted from plan 285's leftovers.
