# 222 — Docking ports and docking

**Plan:** [plans/222-docking.md](../plans/222-docking.md) · **Session:** Worker A, 2026-10-19 · **ADRs:** [0218](../decisions/0218-docking-capture-merge-and-undock.md), [0208](../decisions/0208-vessel-switching-per-vessel-designs-docking-fleet.md) · **Research:** 08, 15c §3, 16

## What was done

| Where | What |
|---|---|
| `mods/stock` | `stock.docking-port` module (Undock, Crossfeed); ports 0.625 / 1.25 / 2.5 m; tech node; generator |
| `packages/core` | `dock` and `crossfeed` module hooks; `TargetRef.part`, `TargetSnapshot.port`, `VesselSnapshot.ports`; events `vessel:docked` / `vessel:undocked`; milestones `dock` / `undock`; API 0.1.78 |
| `packages/sim` | `docking.ts`: wake near ports, pull, capture, merge with a `DockRecord`, `restoreUndocked` from the split, port alignment and port faces; crossfeed barrier in `passesFlow` |
| web | port entries in the Target list; the alignment line in the Target panel; Docked / Undocked toasts and log lines; the flight follows a dock or undock of the active vessel |
| tests | `packages/sim/test/docking.test.ts` (9), `target-model.test.ts`, `e2e/docking.e2e.ts` |

## What surprised me

- **A station parked on rails could never be docked with:** capture needs both vessels in one flight frame, and idle vessels go on rails after 2 s. Port vessels within 50 m now wake and stay in flight (ADR 0218 point 5).
- **The e2e needs the clock paused** to place the second vessel 20 m away: 20 m of orbit is 3 ms at 7.6 km/s.
- **A sideways miss never captured:** the faces met 0.13 m apart side by side, and the "line between the faces within 15°" rule failed. Inside the capture range only the face angle counts now.
- **Software-rendered frames hold a key for most of a second** in headless Chromium: a 30 ms RCS tap gave 5 m/s. The e2e flies a 28 t Alpha so one press adds about 0.1 m/s.
- **The stock probe core has no reaction wheel,** so the target vessel needs one to turn its port; both vessels hold SAS target on each other, which keeps the faces in line through the curved relative path.
- **A failing `target-set` hid behind a missing control source** in the first draft of the port target test: assert the reason, not only `ok: false`.

## Decisions made (link ADRs)

- ADR 0218; the rest in the plan's Log (no save version bump, "Set as target" in the Target list).

## Open questions / follow-ups

- Plan 226 reads `VesselSnapshot.ports` for the Locked camera.
- Angle snap (P1) and the docking lesson (plan 229) are out of scope.

## Verification output

```
(filled at hand-over)
```
