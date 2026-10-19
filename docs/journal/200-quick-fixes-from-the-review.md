# 200 — Quick fixes from the owner review

**Plan:** [plans/200-quick-fixes-from-the-review.md](../plans/200-quick-fixes-from-the-review.md) · **Session:** Worker B, 2026-10-19 · **ADRs:** [0109](../decisions/0109-control-needs-a-command-source-like-ksp-career-crew-preset-and-10px-text.md), [0216](../decisions/0216-crew-in-seats-auto-crew-and-the-pad-state.md) · **Research:** none

## What was done

| Where | What |
|---|---|
| `packages/sim` | `crewAboard`; `controlProblem` says `no-crew` for empty seats; comms skips an empty seat part; `autoCrew` at `load-vessel` without a crew list; `VesselState.launchedAt` (first stage, or load off the surface), copied on split and in the snapshot; no change to the throttle rules |
| `packages/core` | `uncontrolled: 'no-crew'`, `VesselSnapshot.launchedAt` |
| HUD | "On the pad, ready to launch"; MET from liftoff, world time on the clock before it; Orbit panel "On the surface, no orbit yet"; the chip's `no-crew` text; one blackout badge; 50 % throttle at launch (`hud-throttle`), sent with the first stage; Camera and Crew tooltips |
| tests | sim `control-source.test.ts`; vitest `hud/pad-state.test.ts`; e2e `pad-state.e2e.ts`; older tests seat crew or pass `crew: []` where they relied on empty pods |

## What surprised me

- **ADR 0109 as written makes every first launch uncontrolled:** new worlds have no crew (ADR 0176) and the Launch screen sends no crew unless the player picks some. Auto-crew keeps the plain launch working (ADR 0216).
- **Key order matters to the resume tests:** a hired member's `location` key had to exist from the start, or a resumed save differed byte for byte.
- **A raised throttle on the pad wakes the vessel and caps warp at 10× "engine running"**, and sim tests rely on that rule. So the 50 % stays in the HUD until the first stage sends it.
- "Catch up to now" was already gated by the system's calendar; only the test was missing.

## Decisions made (link ADRs)

- ADR 0216; the rest in the plan's Log.

## Open questions / follow-ups

- ADR 0109's status line could note the expired "until plan 106" exception (the plan's docs checklist asks the coordinator).
- Camera stays disabled until plan 226.

## Verification output

```
bun test packages/sim packages/core packages/scripting   919 pass, 0 fail
web vitest hud/pad-state.test.ts: 4 pass (pad state, one blackout badge, catch-up stock vs Sol)
check:affected --build --e2e e2e/pad-state.e2e.ts (after the rebase on plan 216): all passed in 281 s
  typecheck 11 workspaces + web, bun test 10 workspaces, web vitest 587 pass, build, pad-state 2/2
CI ready/200: refs/ci/pass/e5eeb3d5
```
