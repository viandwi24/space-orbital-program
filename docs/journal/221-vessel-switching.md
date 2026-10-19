# 221 — Vessel switching and per-vessel designs

**Plan:** [plans/221-vessel-switching.md](../plans/221-vessel-switching.md) · **Session:** Worker B, 2026-10-19 · **ADRs:** [0208](../decisions/0208-vessel-switching-per-vessel-designs-docking-fleet.md), [0215](../decisions/0215-design-records-in-the-sim-envelope-3.md) · **Research:** none

## What was done

| Where | What |
|---|---|
| `packages/sim` | `VesselState.design` set at load and shared on split; `vessel-design.ts` (`designRecord`, `rebuildDesign`); `Sim.designOf`; `vessel:split` with each side's indices; `PartSnapshot.index`, `VesselSnapshot.nextStage` and `controlPart`; `set-control-part` and `controlNose` in SAS (flight and rails) |
| `packages/core` | the command and its schema, `ModuleDefinition.controlPoint`, the event |
| web worker protocol | `design` request and reply; `SimClient.designOf` |
| `save/game-save.ts` | envelope 3: a version 2 save seeds its focus vessel's design and re-signs the payload |
| flight | `switchVessel` (new HUD from the record and the snapshot, camera, presence, script stopped, toast), `cycleVessel` (`[`/`]` within 2.5 km), the current `design` for saves and the world session's focus |
| HUD | navball and attitude from the control part; Target card "Switch to"; vessel panel "Control from here" |
| Mission Center | Fly for every vessel of the player (an agency's object says why not) |
| keys | `vesselNext` `]`, `vesselPrev` `[`; trim on Home / End |
| e2e | `vessel-switch.e2e.ts` (keys, and Fly from the Mission Center) |

## What surprised me

- **The design indices were already in the sim** (`PartState.index`), so a record is just the launch design plus the indices a vessel still has; the envelope only needs to seed older saves (ADR 0215).
- **A rebuilt design must not be written back:** the resume tests compare a resumed save byte for byte, so `designOf` builds it on demand.
- **Removing roll about the nose** in `pointError` generalises the old `{ x, 0, z }` (the root's nose is +Y); with a part turned 90° the root's Y axis is a pitch axis.

## Decisions made (link ADRs)

- ADR 0215; the rest in the plan's Log (trim keys, where "Switch to" sits, where the Mission Center case lives).

## Open questions / follow-ups

- Plan 216 decides the final keys for trim and switching per profile.
- Map markers of other vessels have no card; "Switch to" there comes with a map card (plan 223's vessel list adds Fly too).

## Verification output

```
bun test packages/sim packages/core packages/scripting   915 pass, 0 fail
web vitest: 149 files, 1103 pass (game-save 2, mission-center model, keybindings)
svelte-check: 1873 files, 0 errors
playwright chromium: vessel-switch 2/2, mission-center, smoke (7): 10 passed
check:affected --build --e2e e2e/vessel-switch.e2e.ts: all passed in 294 s
CI ready/221: refs/ci/pass/531d3a13
```
