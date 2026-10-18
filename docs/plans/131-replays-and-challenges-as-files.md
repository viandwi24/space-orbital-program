---
id: 131
title: "Replays and challenges as files"
status: in-progress
owner: "Agent 2"
depends: [077]
phase: 9
created: 2026-10-17
updated: 2026-10-18
---

# 131 — Replays and challenges as files

## Goal

A flight can be saved as a replay (a start save, the command log and periodic checkpoints, a few kB) and re-simulated headless to verify it; a challenge file (system, rules, goal, score axes such as cost, mass, time, Δv margin) can be imported, played and scored against the local history; ghosts of a replay show in the map and flight view.

## Context

- ADRs: 0098, 0094, [0159](../decisions/0159-replays-and-challenges-as-files.md) (this plan)
- Read: ADR 0098 point 6, ADR 0094 point 5 (no backend; verifiable files), ADR 0050 (saves and determinism bounds).

## Scope

**In:**
- Replay recorder in the host (commands with sim times) and checkpoints.
- Headless verifier (Bun) that re-runs a replay and checks checkpoints within ADR 0050's tolerance.
- Challenge schema and scoring; local history per challenge.
- Ghost rendering from a replay.

**Out:** online leaderboards (no backend).

## Touches

- **Size:** M
- **Edits:** `packages/core`, `packages/sim`, `apps/web/src/lib/save`, `packages/renderer/src`, `tools`
- **Shared contracts:** **file formats (replay, challenge)**

## Design notes

Cross-machine determinism is not a goal; checkpoints absorb small drift.

## Steps

1. Recorder and checkpoints.
2. Verifier.
3. Challenges.
4. Ghosts.

## Acceptance criteria

- [x] `packages/sim` test: a recorded headless ascent replay re-simulates to its checkpoints within the ADR 0050 tolerance.
- [x] `tools` test: the verifier rejects a replay whose final state was edited.
- [x] vitest: importing a challenge file and finishing it records a score on each axis.
- [x] `bun test`, `bun run typecheck`, `bun run build` and `bun run docs:check` pass.

## Docs checklist

- [x] `docs/STATUS.md` updated (board row, next plan, open issues).
- [x] `docs/journal/131-replays-and-challenges-as-files.md` written.

- [x] New ADRs for decisions made here; `docs/research/` for anything looked up.

## Log

- 2026-10-17 — Created as draft from the owner's Fondasi Orbital decisions (ADR 0098, 0094).
- 2026-10-18 — Claimed by Agent 2 (Dev B, M2).
- 2026-10-18 — Refined with ADR 0159: commands stamped with sim time and checkpoints every 10 s (not every host step); verification by re-simulation with a relative tolerance on ADR 0050's bound; challenges scored locally per axis; ghosts as a page overlay.
- 2026-10-18 — Built: replay and challenge files, the recorder in the sim and the web host, the verifier tool, challenges scored locally, ghosts as a page overlay. The renderer is not changed (ghosts are an overlay, ADR 0159 point 7). Handed over as `ready/131`.
