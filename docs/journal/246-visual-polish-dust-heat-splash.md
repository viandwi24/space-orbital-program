# 246 — Visuals: splashed, heat bars, touchdown dust, reduced motion, tooltips

**Plan:** [plans/246-visual-polish-dust-heat-splash.md](../plans/246-visual-polish-dust-heat-splash.md) · **Session:** Worker B (M5), 2026-10-20 · **ADRs:** [0235](../decisions/0235-splashed-flag-heat-bars-dust-reduced-motion.md), 0182, 0204, 0026

## What was done

| Where | What |
|---|---|
| `packages/core`, `packages/sim` | `VesselSnapshot.splashed` from `situationView`; API 0.1.91 |
| `apps/web` telemetry, hud-model | `Telemetry.splashed`; "Splashed down on X" |
| `hud/heat-marks.ts`, `HeatBars.svelte`, `flight-loop.ts` | the six hottest parts get a bar, placed by DOM each frame, not in the map |
| `packages/renderer` | `touchdown` event in `detectTransitions`, a ring of dust in `Effects`; `setReducedMotion` on Renderer, Scene and Effects drops separation flash and explosion glare |
| HUD | `Term` or `data-tip-term` on Δv (current, total), MET, warp, SAS, RCS |

## What surprised me

- The sim already knew about water; only the snapshot did not say so.
- Isp, SOI, Q and Mach have glossary entries but no read-out on the HUD, so there was nothing to wire.

## Open questions / follow-ups

- No e2e (paused by the owner, 2026-10-20): dust, bars and tooltips are not seen in a browser run.
- The glare switch has no unit test (`Effects` needs GL).
- A `reduceMotion` setting (on/off/auto) was left out; the OS choice rules. Navball marker legend tooltips are left for later.

## Verification output

```
bun run check:affected (no e2e: paused by the owner; under /tmp/orbital-heavy.lock)
  ✓ prettier · ✓ docs:check · ✓ typecheck (11 workspaces) · ✓ bun test · ✓ web vitest (704 tests)
  check-affected: all passed in 265.0 s
full local: bun run lint ✓ · bun run test 1977 pass, 0 fail
CI: refs/ci/pass/994a2d88d3b68cd9b07a16a4c46503bc970e4555 (ready/246; the first tag failed on a prettier warning, fixed)
new tests: sim buoyancy (splashed), renderer transitions (touchdown), web heat-marks, telemetry, hud-model, TimeBar
```
