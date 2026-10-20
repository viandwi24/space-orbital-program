---
id: 245
title: "Keys: abort (Backspace) and the abort group, stop warp (/), yaw and roll trim and reset, brakes on hold"
status: done
owner: "Worker B (M5)"
depends: []
phase: 8
created: 2026-10-20
updated: 2026-10-20
---

# 245 — Keys: abort (Backspace) and the abort group, stop warp (/), yaw and roll trim and reset, brakes on hold

**Size:** M

## Goal

Every KSP-profile key that is still `pending` works.

## Context

- The release audit of 2026-10-20 (main @ 4281d931, read-only) found these items Partial or Missing against `refs/rancangan-terpadu.md`. The owner ordered plans for every missing feature at once ("Buatkan plan untuk semua fitur yang kurang sekarang", 2026-10-20). They do **not** block `v1.0.0` (plan 232); they form the v1.1 wave. File and line cites are from the audit; check them against current main when refining. Design: §12.1.
- Backspace abort is `later(...)` at `apps/web/src/lib/keybindings.ts:175`; its handler only deletes a map node (`flight-loop.ts:838-840`) and there is no `stock.abort` action group (`mods/stock/src/action-groups.ts:5-16`).
- `/` stop warp is pending at `keybindings.ts:193` with no handler.
- Trim yaw and roll Alt+A/D/Q/E and reset Alt+X are pending at `keybindings.ts:184-188`.
- B is a toggle, not a hold (journal 216). The owner complained about the key profile (C19).

## Scope

**In:**

- A `stock.abort` group (Hangar-editable like other stock groups if 218 allows; otherwise default members: decouplers of the top stage, parachutes armed) and Backspace in flight fires it, with a confirm toast; in the map with a node selected it still deletes the node.
- `/` stops warp to 1×.
- Yaw and roll trim with reset, shown in the HUD like pitch trim.
- Brakes on hold (B down = on), with the toggle kept in the Classic profile.

**Out:**

- Script functions for these.

## Touches

`apps/web/src/lib/keybindings.ts`, `apps/web/src/lib/flight-loop.ts`, `mods/stock/src/action-groups.ts`, `packages/sim/src` (trim axes) and the HUD trim read-out.

## Steps

1. Refine and decide the abort default in an ADR if 218's group editor cannot edit stock groups.
2. Wire each key with a unit test in the keybindings and flight-loop tests.
3. Chromium e2e on the Linux machine: Backspace fires abort; / drops warp; Alt+A trims yaw. (Skipped: e2e paused by the owner, 2026-10-20.)
4. Light checks locally, push `ready/245` for CI, and follow the worker brief (batch mode while it is in force).

## Acceptance criteria

- [x] No KSP-profile action is left `pending`; tests pass.
- [x] Abort fires the abort group; / stops warp; trims and reset work; brakes hold.
- [x] CI is green on `ready/245`. The Chromium e2e of this plan was not written or run (e2e paused by the owner, 2026-10-20).

## Docs checklist

- [x] STATUS row, journal `docs/journal/245-keys-abort-stopwarp-trim.md`, remove the matching Known-issues lines, any ADR written while refining.

## Log

- 2026-10-20 — Created by the coordinator from the release audit (owner order). Draft: the owner (Worker E) refines it against current main before claiming.
- 2026-10-20 — Worker B (M5) took Worker E's queue (coordinator, owner's order) and refined it against main. ADR 0233. Findings that changed the plan: pitch trim had no HUD read-out at all (the plan assumed one), so the chip is new; stock groups are descriptor-based and one descriptor belongs to one group, so the Abort group is the design's custom slot 0 instead of a `stock.abort` group (Hangar-editable at once); B's toggle and the held brakes are two actions (`brakes`, `brakesHold`) because the profiles differ.
- 2026-10-20 — Tests (no e2e): keybindings (28), sim `abort-and-trim.test.ts` (Abort group, trim axes, control offsets), core `design.test.ts` (trim and slot 0 schema), web `groups.test.ts` and `vessel-model.test.ts`. API 0.1.90.
