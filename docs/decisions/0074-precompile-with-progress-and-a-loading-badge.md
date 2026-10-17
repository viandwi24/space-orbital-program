# 0074 — A precompile with progress, ordered by need, and a loading badge

**Status:** accepted
**Date:** 2026-10-17
**Plan:** plans/038-water-site-animation-and-devices.md

## Context

Journal 054: `Renderer.precompile()` resolves 84 s after the page loads (hidden pane, M5). Until then a preset switch or a governor rung that needs a program not yet compiled stalls the frame (300 to 600 ms), and nothing tells the player or the page that this is going on.

## Decision

Measured in journal 038 (hidden built-in pane, Apple M5, `Renderer.precompile()` from the page's launch click to its resolution):

1. **The shader compile is not the 84 s.** The twelve programs of the three presets (scene states, planet and march variants, half-resolution target states, the upsample) are all ready about 1.4 s after the first frame is drawn (9.5 to 11 s after the page was asked to start, dominated by the first compile of this preset's scene). The rest was the vegetation warm-up: `LaunchSite.warmVegetation` took one 0.3 ms step per idle period and a hidden page's idle periods come every 2 s, 34 steps. Steps now run for 6 to 12 ms per idle period (the period's own allowance, bounded). Base 79.9 and 83.9 s, this plan 10.1 to 30.6 s with a page that only waits, about 28 s for both with a page that renders.
2. **Progress**: `precompile(onProgress)` reports `{ done, total, stage, fraction }` from a counter (`precompile-progress.ts`, pure); the first compile is counted once the rest is planned, so there is no badge at 100 percent before the first frame; the fraction stays under 1 until the work is done; the stages are programs, maps, vegetation, done.
3. **Order**: this preset first, then the presets below it (a quality change goes down: ADR 0053's ladder), then the ones above; each preset's half-resolution target-state program follows it; all compiles start in the same turn so the driver compiles side by side, and each job puts the render target and shadow flag back in the same turn (frames drawn between are not disturbed). No concurrency limit: the first idea, a pool of N, was dropped when the measurement showed no program is slow.
4. **The badge** is a small pill under the toasts (`PrecompileBadge.svelte`, fed by `FlightOptions.onGraphics`): a label, a 64 px bar and a percentage; it shows only while the precompile has work left, takes no pointer and never covers the HUD.
5. Precompile stays optional and never blocks the first frame. First-switch hitch is unchanged (28 to 50 ms), not improved: the sets were not the cost of the switch.

## Alternatives considered

- **A pool of N concurrent compiles**: no program is slow to compile (the whole set is ready in 1.4 s once started).
- **Precompiling only the presets at or below the player's**: saves nothing measurable and a manual switch to a higher preset would stall.
- **A blocking loading screen**: the first frame does not wait for any of this.

## Consequences

- `Renderer.precompile` takes an optional callback; `Renderer` gains nothing else. The badge only exists in the flight page.
- The vegetation sets of all presets are ready within seconds on a page that has idle time, so a manual switch soon after launch no longer builds them in the switching frame.
- On M1/M2/Intel the numbers are unknown (draft 066).
