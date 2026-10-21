---
id: 305
title: "English in-game text: part nicknames, blueprint names, and a guard test"
status: done
owner: "part visuals session (Claude)"
depends: []
phase: 0
created: 2026-10-21
updated: 2026-10-21
---

# 305 — English in-game text

## Goal

No Indonesian in the game: every part nickname and blueprint name is English, and a test fails if a common Indonesian word comes back (ADR 0268).

## Context

- ADRs 0255, 0268.

## Scope

**In:** the nicknames in `mods/stock/src`, the six blueprint names and ids, `mods/stock/test/english.test.ts`, a check in `apps/web/src/lib/editor/missions.test.ts`.
**Out:** owner-facing docs.

## Steps

1. Rename the nicknames (74 distinct ones) and the blueprints.
2. Add the guard tests.
3. Sweep the web UI for Indonesian words.

## Acceptance criteria

- [x] `bun test mods/stock/test/english.test.ts`: scans more than 500 strings of every registry and finds no Indonesian word.
- [x] The blueprint test checks titles, texts and design names.
- [x] A grep of `apps/web/src`, `mods/stock/src` and the sim and core sources finds no Indonesian words outside tests.

## Docs checklist

- [x] `docs/STATUS.md` updated.
- [x] `docs/journal/305-english-in-game-text.md` written.
- [x] ADR 0268 written.

## Log

- 2026-10-21 — Done on the owner's request.
