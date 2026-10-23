# 0338 — A governor for 120 Hz: a lock of 120 or 60, TAAU as the fast axis

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/395-governor-for-120hz.md
**Amends:** ADR 0233 (the governor's rules: a locked 60 or 30), ADR 0304 (Automatic steps presets on WebGPU)
**Builds on:** ADR 0330 (graphics v2 and 120 Hz), ADR 0336 (TAAU), ADR 0310 (every pipeline is built at load)

## Context

The governor held a locked 60 (30 where 60 was out of reach) and walked resolution rungs before presets. On a 120 Hz screen with a tier that can hold 120 (the M5), that left the frame at 60 or "the display's rate" with a 60 ms budget, so a 12 ms frame passed as healthy. Plan 393 gave a resolution axis that builds no pipeline (the TAAU input scale); plan 392 gave the tiers and showed that Apple's per-pass timestamps do not add up and that `gpuFrameMs` under-reads.

## Decision

1. **The lock.** The target is 120 when the tier's ceiling is 120 (`device-tier.ts`: `m5`, `apple`, `discrete-high`), the browser is not Safari and the screen runs at 100 Hz or more; else 60; 30 as before. The budget is its period (8.33 ms; a frame is over at 1.15 of it). The player's limit (`Display`, `120`, `60`, `30`) caps it. On battery, with no limit chosen, the limit is 60 (Chrome's Battery API; `charging` unknown means no limit).
2. **The fast axis.** On WebGPU with a 120 tier, each preset that has the post chain walks the TAAU input scale: `high` native, 0.75, 0.6; `medium` 0.5 (its own); the last preset goes down to 0.5. Below 0.6 the next preset comes first, because on the M5 `high` gains little under 0.6 (its cost is not the pixels, plan 393). `low` has no post chain and keeps the old rungs. A TAAU rung changes no pipeline; three reallocates the pass's render target on a scale change, which is a texture allocation of a few milliseconds and no shader work (making it allocate nothing needs the pass target at its largest size; plan 395 does not do it).
3. **Falling to 60.** At the lowest rung and still slow for `lockSeconds` at 120, the target becomes 60 (as 30 followed 60 before). The rungs above are tried again on evidence, as after any drop. The 60 target paces the drawing to every second rAF on a 120 Hz screen.
4. **The way back to 120.** From the 60 lock, after `unlockSeconds` (60 s), on evidence only: the work time measured at the current rung, scaled to the lowest rung by `levelCost` and by what the timestamps under-read (`workScale`), fits 0.8 of the 120 slot; or the scene changed since the lock (one look per scene). The step is to the lowest rung, one trial; a trial that misses returns to 60 and is banned in that scene.
5. **The display rate is not forgotten.** A frame longer than a slot stretches the rAF intervals, and a 12 ms frame on a 120 Hz screen reads as 60 Hz. The estimate's peak (100 Hz or more) is latched for the session, and the host passes the rate it measured at load before the game loaded the machine (`setDisplayHint`, `probeRefreshHz`). A display found to run at 30 Hz resets it. Known limit: a screen that drops from 120 to 60 mid-session (a power mode) is read as 120 until the throttle rule ends at 30.
6. **Start and learn.** `selectPreset` starts non-Apple GPUs at their tier's preset (GTX 1650 and RTX 3050 `medium`, Iris Xe and 680M `low`, RTX 3060 and up `high`); a saved choice still wins. The learned level is saved per backend and per lock target (`webgpu@120`) and carries its TAAU rung.
7. **TAAU rungs only where 120 is the aim.** The TAAU ladder is used only when the tier's ceiling is 120; the 60 tiers keep the render-scale ladder, because TAAU was measured on the M5 only (M2 and mid-range Windows runs are manual items of plans 392 and 395).
8. **Rules at 120.** The over, p95 and trial rules are relative to the budget and unchanged; the steady-judder share is 6 % at a 120 target (10 % at 60): a p95 within one slot means at most 5 % over.

## Consequences

- The governor can sit at a 60 lock on a 120 Hz screen, paced at every second rAF, and goes back only on evidence.
- `Display` on a 120 tier now aims at 120, where it used to judge by 60 ms.
- The rule that Apple's timestamps under-read stays (`workScale`); nothing here trusts `gpuFrameMs` alone.
- Known follow-ups: a TAAU scale change with no reallocation; FSR 1 for the cut frame and for WebGL2 (plan 393); M2 and Windows measurements.
