# 392 — 120 Hz measurement and baseline

**Plan:** [plans/392-120hz-measurement-and-baseline.md](../plans/392-120hz-measurement-and-baseline.md) · **Session:** Worker A, 2026-10-24 · **ADRs:** 0330, 0248 · **Note:** [refs/graphics-v2/05-m5-120hz-baseline.md](../../refs/graphics-v2/05-m5-120hz-baseline.md)

## What was done

| Where | What |
|---|---|
| `renderer/device-tier.ts` | `tierOf`, `deviceTier`, `refreshOf`, `targetHz`: the tier of a GPU string and the lock from the display; tests for M5, M2, Iris Xe, 680M, GTX 1650, RTX 3050 and the rest |
| `renderer/frame-report.ts` | `frameReport` (p50, p95, p99, shares over 16.7 and 8.4 ms), `lockHeld`, `intervalsOf`; tests on synthetic series |
| `renderer/pass-timing.ts`, `renderer-webgpu.ts` | every command encoder carries its pass (`planet`, `moon`, `scene`) as label and debug group; `passTimes` groups the timestamp pool's contexts by pass; `Renderer.passTimes` |
| `web/scripts/lib/frame-matrix.ts`, `measure-120hz.ts`, `measure-tier.ts` | the matrix (backend × preset × governor × view) with rAF intervals, Long Animation Frames, GPU per pass, compile times; `measure-tier.ts` is the one-command report for the M2 and Windows machines |
| `refs/graphics-v2/05-m5-120hz-baseline.md`, `data/m5-120hz-run1.json` | the M5 baseline |

## Findings

- No WebGPU cell is near p95 8.4 ms; `medium` sits at 17 to 18 ms (a 60 Hz slot), `high` at 18 to 25 ms.
- WebGL with the governor on holds 120 fps at 1285 × 803 at 12 km and in orbit: the cost is in the pixels.
- 18 render contexts per frame (3 planet, 15 scene): the count 394 starts from.
- **Apple timestamps are not additive**: every context reads 7 to 14 ms. Passes can be ordered, not summed.
- **`gpuFrameMs` under-reads** (last frame's inflated sum divided by 30): 395 must not use it as it is.
- **Chrome hides the Apple chip model** (adapter description empty): tiers on Apple come from the display's rate.

## Not done

- The Xcode Metal capture (no Xcode on this machine), the 2-minute cells on a quiet machine (the load was 5 to 6 from other jobs), the M2 and Windows sections: `[manual]`, tracked in the note's open items. The acceptance items that need them stay open.
- `capture-graphics.ts` was not re-run for "no visual change": the labels and contexts touch no pixels, but the check was not made.
- The main-thread split beyond Long Animation Frames needs a Chrome trace.
