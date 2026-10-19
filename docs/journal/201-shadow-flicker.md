# 201 — Shadow flicker on the high preset

**Plan:** [plans/201-shadow-flicker.md](../plans/201-shadow-flicker.md) · **Session:** Worker B, 2026-10-19 · **ADRs:** [0053](../decisions/0053-frame-budget-governor-march-prepass-and-terrain-veil.md), [0055](../decisions/0055-cheaper-preset-switches.md) · **Research:** none

## What was done

| Where | What |
|---|---|
| `packages/renderer/src/environment.ts` | the sun shadow map is allocated once and only grows; a lower or shadowless preset keeps it; the shadow matrix is computed for this frame (`updateMatrices`) before the planet copies it |
| `packages/renderer/src/quality-governor.ts` | `presetDwellSeconds` (30 s between preset changes) and `presetProbationSeconds` (60 s of calm before a trial into the next preset up); resolution rungs are not held |
| web | Debug → Info "Graphics changes": the governor's last five changes with the time since the flight began |
| tests | `preset-switch.test.ts` (one map, no resize, no free; growth when the player raises the preset), `quality-governor.test.ts` (swinging traces, a CPU-bound machine), new `shadow-matrix.test.ts` |

## What surprised me

- **The planet read last frame's shadow matrix:** three.js computes `shadow.matrix` inside the shadow pass, after the environment had copied it. While the camera or the light moved, the ground's shadow lookup was one frame behind the parts', a flicker at the pad. The new test fails with the old order.
- **A fixed frame-time trace never showed the bounce.** The bounce needs the feedback: a CPU-bound machine is over budget at every High rung and under it on Medium, so the governor stepped down, waited 20 s, tried High again and fell back 6 s later (changes at 24, 46, 52, 94, 100 s). With the dwell the changes are 30 s or more apart (24, 86, 116, 178 s).

## Decisions made (link ADRs)

- No new ADR: the governor's contract (levels in, one level out) is unchanged; the dwell and the longer probation are two config fields. ADR 0053's consequences gain one line: a preset change waits 30 s after the last one, so a machine at the edge of a preset shows at most one switch per half minute, and a failed trial up stays over budget for up to 30 s before it falls back.
- ADR 0055's "a preset switch reallocates the shadow map a few frames later" now holds only for a larger map.

## Open questions / follow-ups

- [manual] The 2-minute check on the M5 at the pad with High and "Adjust quality while playing" on is left to the owner.
- The `nearSite` 300 m threshold (cause 3) is out of scope.

## Verification output

```
bun test packages/renderer: preset-switch 12 pass, quality-governor 21 pass, shadow-matrix 1 pass
  (shadow-matrix fails with the old copy order: checked by disabling the fix)
governor trace, CPU-bound high: preset changes before 24 46 52 94 100 182 188 s, after 24 86 116 178 208 s
check:affected --build --e2e e2e/smoke.e2e.ts (after the rebase on plan 211): all passed in 190 s, smoke 7/7
CI ready/201: refs/ci/pass/c122a9f5
```
