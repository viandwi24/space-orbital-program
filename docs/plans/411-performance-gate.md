---
id: 411
title: "A performance gate: a scene benchmark every renderer or looks change must pass before it merges, with budgets per scene and per device tier"
status: ready
owner: "Worker C"
depends: []
phase: 9
created: 2026-10-24
updated: 2026-10-24
---

# 411 — A performance gate before every renderer or looks merge

**Size:** M

## Goal

A change that makes the game slower can no longer reach main unnoticed. Today's graphics plans merged on unit tests and typecheck alone, and the game became less playable (owner, 2026-10-24).

## Context

- **What went wrong.** E2E is paused by the owner, and CI runs on GPU-less runners, so nothing measured frame time at merge.
- **Tools that already exist:**
  - the measuring script (251/392: `apps/web/scripts/measure-graphics.ts` or its successor);
  - the long-frame recorder (408);
  - the Debug compile counter (410).
- **Tiers.** The targets per device tier are set in ADR 0330:
  - M5: a locked 120;
  - base M2 and mid-range Windows: a locked 60.

## Scope

**In:**
- **One command** (`bun run perf:gate`) that builds once and runs fixed scenes headed. The scenes:
  - pad;
  - 3 km;
  - 12 km;
  - sea level;
  - orbit;
  - re-entry;
  - Space Center;
  - Hangar.

  It runs on WebGPU and WebGL, with the governor off at a fixed preset and again with it on. It reports per scene:
  - p50/p95 frame interval;
  - long frames (over 2× the interval) per minute;
  - pipeline compiles after load;
  - JS heap min and max.
- **Budgets per scene** in a checked-in JSON file. The first values come from the measured state after plans 408, 409 and 410. The gate fails on a regression over a margin (for example p95 + 10 %, any long frame, any compile in play).
- **Rule in the worker brief:** a plan that touches `packages/renderer`, the looks or the page loops must run the gate on the M5, under `/tmp/orbital-measuring`, and put the table in its journal before merging. A failure blocks the merge unless the owner accepts it.
- **A short version for the owner** to run on the M2 and on Windows: the same command with `--quick`, which prints the table to paste back.

**Out:**
- GPU runners in CI.

## Steps

1. Build the script on the existing measuring tool. Add the scenes through the debug API, and the counters (compiles, long frames, heap).
2. Freeze the first budgets after 408, 409 and 410 have merged.
3. Add the rule to `docs/roadmap/worker-brief.md` and to the plan template's acceptance list.

## Acceptance criteria

- [ ] `bun run perf:gate` runs every scene on both backends and writes the table; a unit test covers the budget comparison.
- [ ] Budgets are checked in and the brief requires the gate for renderer and looks plans.
- [ ] The owner's `--quick` mode prints a paste-ready table (`[manual]` run on the M2 and on Windows).
- [ ] Affected unit tests and the typecheck pass. E2E is paused by the owner.

## Docs checklist

- [ ] STATUS row, journal, worker brief rule, plan template line.

## Log

- 2026-10-24 — Created by the coordinator after the owner reported that today's graphics work made the game less playable. Runs after 409 on Worker C.
