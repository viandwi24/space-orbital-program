# 131 — Replays and challenges as files

**Plan:** [plans/131-replays-and-challenges-as-files.md](../plans/131-replays-and-challenges-as-files.md) · **Session:** Agent 2 (Dev B, MacBook Pro M2 13"), 2026-10-18 · **ADRs:** [0159](../decisions/0159-replays-and-challenges-as-files.md) (new), [0050](../decisions/0050-save-format-and-resume.md), [0098](../decisions/0098-progression-economy-career-and-milestones.md), [0094](../decisions/0094-worlds-are-saves-modes-are-presets-over-rules.md) · **Research:** none

**Status when written: criteria met.**

## What was done

| Where | What |
|---|---|
| `packages/core/src/replay.ts` | the replay file (`orbital-replay` 1), `readReplay`, `checkpointOf`, `checkpointProblem` (5e-3 or 1e-6 of the value) |
| `packages/core/src/challenge.ts` | the challenge file (`orbital-challenge` 1), `readChallenge`, the four axes, `scoreRun`, `bestScores` |
| `packages/sim/src/replay.ts` | `recordReplay` (commands with sim time, checkpoints every 10 s) and `verifyReplay` (re-simulation) |
| `tools/replay-verify` | the command-line verifier (exit 0 match, 1 mismatch, 2 bad file); the root `bun test` now runs `./tools` too |
| web | the sim host records every flight from boot (message `replay`), the Pause menu's "Export the replay" and "Load a ghost", `lib/replays` (the ghost's track in map view and its position in both views), `lib/challenges` (import, the world it plays in, scored runs in browser storage), the Worlds screen's "Import challenge", the score toast when the goal milestone is reached |
| tests | sim `replay.test.ts` (2), `tools/replay-verify/test/verify.test.ts` (1), web `replay-host.test.ts` (1), `challenges/challenge-model.test.ts` (2), `replays/ghost-model.test.ts` (2) |

## What surprised me

- **A relative tolerance of 5e-3 is 3 km.** Positions are body-centred: 5e-3 of 615 km let an edit of 500 m through. The bound is 5e-3 absolute (ADR 0050) or 1e-6 of the value (0.6 m at 600 km).
- **Re-simulation is exact here.** The 240 s headless ascent (10 690 commands, 22 checkpoints) and a host flight with uneven 17 and 23 ms frames both re-simulate within the bound on the first try: the sim's fixed steps make the chunking of wall time irrelevant at warp 1.
- **A scripted flight is big.** The ascent's autopilot sends an attitude command every step with a new value: 1.6 MB for 240 s. A hand-flown flight's start save is 5.7 kB. Recording a script's source instead of its commands would need the script engine in the verifier (not done).
- **The sample mod has no package entry**, so the verifier imports it from its source file.
- A challenge's site template is left out of the format for now (the site is the default Space Center).
- Same environment notes as before: `sim-host-script-worker.test.ts` (2 vitest) fails on this machine on main too.
