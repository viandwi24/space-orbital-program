---
id: 385
title: "Wayfarer at Sol scale: a Shuttle for Sol rescaled and 1:1"
status: draft
owner: ""
depends: [380]
phase: 7
created: 2026-10-23
updated: 2026-10-23
---

# 385 — Wayfarer at Sol scale

## Goal

Since plan 380 (ADR 0317), the Wayfarer Shuttle reaches orbit in stock only. In Sol rescaled it loses attitude after booster separation and falls back. In Sol 1:1 it breaks up at about 82 s, likely from booster recontact, and its half-size stack is far short of a real Shuttle anyway: the external tank holds 192 t against the Shuttle's 736 t, and each booster 67.5 t against 500 t. Give it a Sol design (`BlueprintDefinition.systems`) that flies the Shuttle's real profile, and make the ascent hold the stack after the boosters go.

## Context

- ADR 0317; plan 380's `apps/web/src/lib/editor/blueprint-systems.test.ts` (expected `short` in both Sol variants today)
- `apps/web/src/lib/editor/missions.ts` (Wayfarer builder), `mods/stock/src/parts/missions.ts` (external tank, `srb-xl`), `mods/guidance/src/autopilots.ts` (Ascent)

## Scope

In: a Sol-scale tank and boosters (new parts, or more of them); booster separation clear of the orbiter; the ascent's attitude with the offset thrust after separation; the flight test's expectations moved to `goal`.
Out: re-entry and landing at Sol scale (plan 361 covers stock).

## Steps

1. Reproduce both failures with traces (attitude, separation impulse, recontact).
2. Parts or design changes; a Sol design in the blueprint's `systems`.
3. Guidance or design fix for attitude after separation.

## Acceptance criteria

- [ ] `blueprint-systems.test.ts` expects and gets `goal` for the Wayfarer in Sol rescaled and Sol 1:1.

## Docs checklist

- [ ] Plan, STATUS, journal.

## Log

- 2026-10-23: drafted from plan 380.
