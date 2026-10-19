# 206 — Flexible time warp

**Plan:** [plans/206-flexible-time-warp.md](../plans/206-flexible-time-warp.md) · **Session:** Worker B, 2026-10-19 · **ADRs:** [0202](../decisions/0202-flexible-time-warp.md) · **Research:** none (KSP's Kerbin table is the one ADR 0202 quotes from research doc 16)

## What was done

| Where | What |
|---|---|
| `packages/core` | `WARP_LEVELS`, `SOL_WARP_LEVEL`, `PHYSICS_WARP_MAX`, `WarpTarget`, `WarpLimitSnapshot`; `warp { factor, vessel? }`, `warp-to { time | target, factor, vessel? }`; results with `granted` and `limit`; events `warp:clamped`, `vessel:frozen`, `vessel:thawed`; `Snapshot.warpLimit`, `VesselSnapshot.frozen` |
| `packages/sim/src/warp-limits.ts` | `warpTiers`, `topWarp`, `limitingVessels`, `warpLimit`, `clampText` |
| `packages/sim/src/warp.ts` | `requestWarp`, `requestWarpTo` (apsis, SOI, node targets), `packForRails`, `freeze`, `thawFrozen`, `holdWarpLimit`, `dropForThrust`; rails kind `frozen` in orbit, snapshot, SOI, SAS, targets, kicks, save checks, debris reaping |
| scripting | `warp`/`warpTo` name the script vessel; `warpTo('apoapsis' | 'periapsis' | 'soi' | 'node')` |
| web | the time control: the world's levels (9 in Sol), levels above the limit dimmed, the reason (`warp-reason`); the flight sends the watched vessel and shows the granted level; Orbit panel "Warp to Ap / Pe"; the sim host holds a script's attitude only for rails levels |
| e2e | `warp.e2e.ts` |

## What surprised me

- **"Engine running" first read `core.active`**, the forces applied in the last step. A save does not keep it, so a resumed sim reported "in the atmosphere" where the original said "engine running" and the resume-determinism test caught it. It now reads the throttle.
- **A stock world's top of 10k×** changed many sim tests that warped at 1e5–1e6× to skip game days; they warp at 1e4× with longer host steps. A web comms-planning test needed the same.
- **The ADR 0039 hold** (a script's attitude held so the vessel can reach the rails) is only needed for rails levels now; its tests moved from 10× to 50×, and a burning script gets 10× with the reason instead of a refusal.
- **The script's `warp()` promise still resolves `{ ok }` only**: the prelude passes the verdict's `ok` and `reason`, not `granted`. Scripts read the level from the snapshot.

## Decisions made (link ADRs)

- ADR 0202 as written; details in the plan's Log (tiers derived, throttle as "engine running", no extra host frame-budget fallback beyond ADR 0122's).

## Open questions / follow-ups

- Alarms as warp-to targets and transfer windows: plan 224.
- A bell entry for a frozen vessel: the layout shows `warp-stopped`; `vessel:frozen` is not forwarded to the page yet.

## Verification output

```
bun test packages/sim: warp-limits 5, warp-transitions 2, physics-warp 1, pause-rule 3; whole package passes
bun test packages/scripting: 62 pass
web vitest: 1099 pass (WarpControl 5, sim-host-warp 9, telemetry, comms-planning)
playwright chromium: warp 2/2; debug 3, leave-flight, smoke 7, clock, world-shell pass
check:affected --build --e2e e2e/warp.e2e.ts: all passed (again after the rebase onto plan 208: 472 s)
CI ready/206: refs/ci/pass/5db70b8b
```
