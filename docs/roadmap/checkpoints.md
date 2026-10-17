# Checkpoint register

The truth is the tag on the shared remote (`git ls-remote --tags origin 'refs/tags/cp/*'`); this file is its readable register. **Only Agent 1 (Lead) edits it**, in each plan's completion commit `docs(plan-NNN): complete` (see [`team-development-roadmap.md`](team-development-roadmap.md) §3.2 and §7.2). Agents 2 and 3 read it at every session start (README step b).

Status values: `pending` (not merged) · `done` (merged and verified, tag pushed) · `contract` (the contract part landed early, the rest of the plan follows) · `measure` (merged; M5 criterion still open, plan stays `in-progress`). Commit = the merge commit on `main`; the tag points at the completion commit right after it.

Rows are in the planned order within each phase. "Waited on by" lists the agents and plans whose `depends` include it.

| Checkpoint | Plan | Produced by | Waited on by | Status | Commit | Date |
|---|---|---|---|---|---|---|
| `cp/f0-kickoff` | lanes assigned, shared remote set up, baselines recorded | A1 | A2, A3 | done | 844b482 | 2026-10-17 |
| `cp/f1-086-tokens` | 086 | A2 | A1, A2 (069, 087, 088, 089, 091, 093, 113) | done | a9999b3 | 2026-10-17 |
| `cp/f1-079-patch` | 079 | A3 | A1, A2 (065, 090) | done | 18e4b9e | 2026-10-17 |
| `cp/f1-077-world` | 077 | A1 | A1, A2, A3 (078, 080, 081, 082, 083, 084, 087, 131) | done | 9531685 | 2026-10-17 |
| `cp/f1-074-rename` | 074 | A2 | A2 (089) | done | 3eabc11 | 2026-10-17 |
| `cp/f1-075-licence` | 075 | A3 | A2 (089) | done | 01b64d7 | 2026-10-17 |
| `cp/f1-081-calendar` | 081 | A2 | A1, A2 (087, 088, 113, 122) | done | 92c0c9f | 2026-10-17 |
| `cp/f1-082-tick` | 082 | A3 | A1, A2, A3 (095, 098, 102, 106, 114, 126, 128) | done | 59b7dd9 | 2026-10-17 |
| `cp/f1-078-rules` | 078 | A1 | A1, A2, A3 (087, 095, 098, 103, 106, 117, 127, 130) | done | 29f5b1a | 2026-10-17 |
| `cp/f1-084-sites` | 084 | A2 | A1, A3 (068, 090, 092, 114) | pending | | |
| `cp/f1-083-data` | 083 | A3 | A3 (103, 119) | done | 36ac6df | 2026-10-17 |
| `cp/f1-080-trajectory` | 080 | A3 | A1, A3 (113, 123, 125) | pending | | |
| `cp/f1-085-orientation` | 085 | A2 | A1 (122) | pending | | |
| `cp/f1-076-roadmap-page` | 076 | A2 | A2 (089) | pending | | |
| `cp/f1-done` | phase gate F1: all F1 plans merged, phase review (ADR 0108) | A1 | all | pending | | |
| `cp/f2-087-worlds-screen` | 087 | A2 | A1, A2, A3 (091, 092, 100, 102) | pending | | |
| `cp/f2-090-buildings` | 090 | A1 | A1, A2, A3 (065, 091, 092, 130) | pending | | |
| `cp/f2-088-hud` | 088 | A2 | A2 (066, 073, 108, 111, 112) | pending | | |
| `cp/f2-092-site-choice` | 092 | A3 | A1, A2, A3 (124, 127, 128) | pending | | |
| `cp/f2-068-terrain-aa` | 068 | A1 | — (none) | pending | | |
| `cp/f2-069-categories` | 069 | A2 | A2 (093) | pending | | |
| `cp/f2-089-menus` | 089 | A2 | — (none) | pending | | |
| `cp/f2-091-space-center` | 091 | A1 | A1, A2 (063, 065, 066, 094, 096, 105, 108) | pending | | |
| `cp/f2-093-hangar` | 093 | A2 | A2 (073, 094) | pending | | |
| `cp/f2-094-launch` | 094 | A2 | A1, A2 (063, 096, 105, 108, 127) | pending | | |
| `cp/f2-done` | phase gate F2: all F2 plans merged, phase review (ADR 0108) | A1 | all | pending | | |
| `cp/f3-095-economy` | 095 | A1 | A1, A2, A3 (067, 096, 097, 099, 101, 105, 127, 130) | done | a060d06 | 2026-10-17 |
| `cp/f3-098-objectives` | 098 | A3 | A2, A3 (099, 100) | pending | | |
| `cp/f3-106-crew` | 106 | A3 | A1, A2, A3 (107, 108, 109) | pending | | |
| `cp/f3-103-science` | 103 | A3 | A1, A2, A3 (067, 104, 105, 109) | pending | | |
| `cp/f3-104-regions` | 104 | A3 | A3 (129) | pending | | |
| `cp/f3-102-milestones` | 102 | A2 | A2, A3 (105, 121) | pending | | |
| `cp/f3-107-crew-sim` | 107 | A3 | — (none) | pending | | |
| `cp/f3-108-astronauts` | 108 | A2 | A3 (121) | pending | | |
| `cp/f3-067-buoyancy` | 067 | A3 | A2 (127) | pending | | |
| `cp/f3-100-missions` | 100 | A2 | — (none) | pending | | |
| `cp/f3-096-building-levels` | 096 | A1 | A1, A3 (097, 099, 101, 128) | pending | | |
| `cp/f3-099-contracts` | 099 | A3 | A3 (126) | pending | | |
| `cp/f3-105-tech-tree` | 105 | A2 | — (none) | pending | | |
| `cp/f3-101-strategies` | 101 | A3 | — (none) | pending | | |
| `cp/f3-109-eva` | 109 | A1 | A2, A3 (121, 130) | pending | | |
| `cp/f3-097-markets` | 097 | A1 | A3 (126) | pending | | |
| `cp/f3-done` | phase gate F3: all F3 plans merged, phase review (ADR 0108) | A1 | all | pending | | |
| `cp/f4-110-part-actions` | 110 | A3 | A2 (063, 065, 111) | pending | | |
| `cp/f4-114-comms-1` | 114 | A3 | A1, A2, A3 (070, 115, 116, 126) | pending | | |
| `cp/f4-112-dock` | 112 | A2 | A2 (072) | pending | | |
| `cp/f4-113-mission-center` | 113 | A1 | A2 (115) | pending | | |
| `cp/f4-111-vessel-panel` | 111 | A2 | A2 (115) | pending | | |
| `cp/f4-115-comms-1-ui` | 115 | A2 | A1, A3 (070, 116) | pending | | |
| `cp/f4-116-comms-2` | 116 | A3 | A1, A3 (070, 117) | pending | | |
| `cp/f4-117-comms-3` | 117 | A3 | A1, A2, A3 (070, 118, 119, 126) | pending | | |
| `cp/f4-119-comms-4` | 119 | A3 | A1, A3 (070, 120, 129) | pending | | |
| `cp/f4-118-comms-tools` | 118 | A2 | A1 (070) | pending | | |
| `cp/f4-120-comms-5` | 120 | A3 | A1, A3 (070, 121) | pending | | |
| `cp/f4-121-comms-6` | 121 | A3 | A1 (070) | pending | | |
| `cp/f4-070-comms-index` | 070 | A1 | — (none) | pending | | |
| `cp/f4-done` | phase gate F4: all F4 plans merged, phase review (ADR 0108) | A1 | all | pending | | |
| `cp/f5-122-sun` | 122 | A1 | A1, A3 (071, 123) | pending | | |
| `cp/f5-123-elements` | 123 | A3 | A1, A3 (124, 125) | pending | | |
| `cp/f5-071-second-planet` | 071 | A1 | A3 (124) | pending | | |
| `cp/f5-124-sol` | 124 | A3 | — (none) | pending | | |
| `cp/f5-125-n-body` | 125 | A1 | — (none) | pending | | |
| `cp/f5-done` | phase gate F5: all F5 plans merged, phase review (ADR 0108) | A1 | all | pending | | |
| `cp/f6-127-range-safety` | 127 | A2 | — (none) | pending | | |
| `cp/f6-130-reliability` | 130 | A2 | — (none) | pending | | |
| `cp/f6-066-devices` | 066 | A2 | A2 (073) | pending | | |
| `cp/f6-126-agencies` | 126 | A3 | — (none) | pending | | |
| `cp/f6-131-replays` | 131 | A2 | — (none) | pending | | |
| `cp/f6-065-mod-models` | 065 | A2 | — (none) | pending | | |
| `cp/f6-063-aeroplane` | 063 | A2 | — (none) | pending | | |
| `cp/f6-072-script-panel` | 072 | A2 | — (none) | pending | | |
| `cp/f6-129-discovery` | 129 | A3 | — (none) | pending | | |
| `cp/f6-128-bases` | 128 | A1 | — (none) | pending | | |
| `cp/f6-073-phone` | 073 | A2 | — (none) | pending | | |
| `cp/f6-done` | phase gate F6: all F6 plans merged, phase review (ADR 0108) | A1 | all | pending | | |

## Contract checkpoints (mid-phase, §3.6)

| Checkpoint | Contract change | Requested by | Status | Commit | Date |
|---|---|---|---|---|---|
| `cp/f1-contract-tick-epoch` | the world tick reads `WorldInfo.epoch` as SI days from J2000 (ADR 0141) and takes `dayLength` from `calendarOf(bodies)`; today it reads tick days (ADR 0171) | A2 (plan 081) | deferred: to land before 087 merges (both agree at epoch 0) | | 2026-10-17 |

## Reassignments

A task moved to another lane (roadmap §8). The new owner treats it as in its lane at the given position.

| Date | Plan | From | To | Position in new lane | Reason |
|---|---|---|---|---|---|

## Reserved numbers

Save-format versions (`SimSave.formatVersion`) and other single-sequence numbers handed out by Agent 1 before a plan writes its migration (roadmap §3.6). ADR and new-draft numbers use the per-agent ranges of §3.7 instead.

| Number | What | Plan | Agent | Date |
|---|---|---|---|---|
| save format 5 | world container (ADR 0110) | 077 | A1 | 2026-10-17, merged |
| save format 6 | Sun as root: the old root becomes the Sun's child (ADR 0103) | 122 | A1 | 2026-10-17, reserved |
| save format 7 | comms tier 3: pinned routes and policies | 117 | A3 | 2026-10-17, reserved |
| save format 8 | comms tier 4: data queues and stored bundles | 119 | A3 | 2026-10-17, reserved |
