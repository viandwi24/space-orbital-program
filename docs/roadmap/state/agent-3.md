# Agent 3 · Dev C (Linux Mint, 6 CPU, 8 GB) — lane state

> **Only Agent 3 edits this file** (ADR 0112); Agent 1 also sets `done` at merge and may reassign rows. Update it at claim, at each pushed step that changes what you do or wait for, at handover, on a bounce and after the merge. Commit this file alone on `main` (`docs(roadmap): agent 3 state`), `git pull --rebase`, push. Status: `todo` · `in-progress` · `handed-over` · `bounced` · `done`. The tags stay the truth (roadmap §3.2).

**Now:** 110 handed over as `ready/110` (rebased on 080, API 0.1.35). Found: 084's terrain-legacy and sites goldens fail on pure main on this Linux machine (bit-exact floats differ by 5.7e-12). Next in the lane: 092 site-choice.
**Waiting for:** merge of 110; 092 waits for cp/f2-087-worlds-screen and cp/f2-090-buildings.
**Updated:** 2026-10-17

| Plan | Status | Branch | Updated | Note |
|---|---|---|---|---|
| 079 patch | done | `devc/079-define-patch` | 2026-10-17 | merged, cp/f1-079-patch |
| 075 licence | done | `devc/075-licence` | 2026-10-17 | merged, cp/f1-075-licence |
| 082 tick | done | `devc/082-world-tick` | 2026-10-17 | merged 59b7dd9, cp/f1-082-tick |
| 083 data | done | `devc/083-data-items` | 2026-10-17 | merged 36ac6df, cp/f1-083-data |
| 080 trajectory | done | `devc/080-trajectory` | 2026-10-17 | merged 0354289, cp/f1-080-trajectory |
| 110 part-actions | handed-over | `devc/110-part-actions` | 2026-10-17 | ready/110; ADR 0174; API 0.1.35 |
| 092 site-choice | todo |  |  |  |
| 098 objectives | todo |  |  |  |
| 106 crew | todo |  |  |  |
| 103 science | todo |  |  |  |
| 114 comms-1 | todo |  |  |  |
| 104 regions | todo |  |  |  |
| 107 crew-sim | todo |  |  |  |
| 067 buoyancy | todo |  |  |  |
| 123 elements | todo |  |  |  |
| 099 contracts | todo |  |  |  |
| 101 strategies | todo |  |  |  |
| 116 comms-2 | todo |  |  |  |
| 117 comms-3 | todo |  |  |  |
| 119 comms-4 | todo |  |  |  |
| 126 agencies | todo |  |  |  |
| 120 comms-5 | todo |  |  |  |
| 124 sol | todo |  |  |  |
| 121 comms-6 | todo |  |  |  |
| 129 discovery | todo |  |  |  |
