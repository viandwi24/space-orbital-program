# 0340 — Tile-GPU hygiene: what three already does, and the three trials that did not ship

**Status:** accepted
**Date:** 2026-10-24
**Plan:** plans/394-apple-tile-gpu-hygiene.md
**Builds on:** ADR 0330 (graphics v2), ADR 0336 (TAAU), ADR 0248 (the WebGPU frame)

## Context

Plan 394 asked for discard/store actions, transient attachments, one merged final pass, a quarter-size bloom source and `rg11b10ufloat` targets, expecting 1 to 3 ms at Retina on Apple GPUs.

## Findings

1. **three r186.1 already does the store/discard and transient work** where it applies (`WebGPUBackend.js`, `WebGPUTextureUtils.js`): multisampled colour and depth are discarded and transient when the render target says `storeMultisampledColorBuffer/DepthBuffer === false`, resolved in the same pass. The research note that said three does not set `TRANSIENT_ATTACHMENT` is out of date for r186. Under TAAU MSAA is off and the scene pass's depth is sampled by the TAAU node, so there is no unread attachment left to discard.
2. **The final pass is already one:** `RenderPipeline.outputNode = colour + bloom`, with tone mapping and sRGB in that node (ADR 0248). Sharpening (RCAS) is not in the pipeline.
3. **Trials on the M5** (Chrome, tier `apple`, 120 Hz, 1285 × 803 at DSF 2, WebGPU, governor off, `high` and `medium`; `refs/graphics-v2/data/m5-tile-*.json`): bloom source at ¼, the scene pass's colour as `rg11b10ufloat` (type `UnsignedInt101111Type`, format `RGBFormat`, set after the velocity texture is cloned), and an opaque canvas (`alpha: false`). The machine's load rose from 3 to 6 over the run (Chrome itself), and two identical base runs differ by a factor of two at `high` (p95 25 against 43 ms). No variant showed a gain outside that noise. The `rg11b10ufloat` target and the three together froze the page in orbit in both runs (p95 500 to 1000 ms, long animation frames of 0.5 to 1.8 s), at both presets, while the bases did not: it is unsafe as built (a pass reads or writes the target in a way the format does not allow, not investigated).

## Decision

Nothing ships. The trial switches (`__orbitalTile`) are removed again; the data stays. The follow-ups, in order of promise, are measured on a machine with a load under 3 and with the Metal capture of the frame end (a manual Xcode step) naming the passes first: the bloom source at ¼ (cheapest and safest), then the opaque canvas, then `rg11b10ufloat` with a check of every reader of the target (TAAU's history, bloom's first mip).

## Consequences

- The wave's 120 Hz gap is not in the tile-GPU hygiene that three already has; 395's `low` result points at the floor's own cost.
- Plan 394 closes with its measured acceptance unmet and its Metal capture [manual].
