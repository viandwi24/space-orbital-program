# 298 — The telescope observation needs its door open and its tube pointed

**Plan:** [plans/298-satellites-and-telescope.md](../plans/298-satellites-and-telescope.md) · **Session:** Worker B (M5), 2026-10-24 · **ADR:** [0331](../decisions/0331-experiment-conditions-door-and-pointing.md)

## What was done

| Where | What |
|---|---|
| `packages/core` `science.ts` | `ExperimentDefinition.needs` (`open`, `pointing`), in the schema and the type |
| `packages/core` `definitions.ts` | `VesselApi.sibling(moduleId)` and `targetDirection()` (both optional in fakes); API 0.1.120 |
| `packages/sim` `hooks.ts` | `sibling` reads another module's snapshot on the same part; `targetDirection` turns the direction to the set target, else to the planet's centre, from the inertial frame into the part frame, through the vessel's attitude and the part's turn; it works on rails |
| `mods/stock` `science.ts` | `needsProblem` checks the door and the pointing at the start of a run and every step; the observation has `needs: { open: 'stock.animate', pointing: 5 }` |
| tests | `mods/stock/test/observation-conditions.test.ts` (5: shut door, 10° off, 4° off runs and stores, a run stops when the door closes or the tube swings, the magnetometer is unchanged) and `packages/sim/test/telescope-observation.test.ts` (a real vessel in a 300 km orbit: door shut, door open and pointing down, 10° off, 4° off) |

## What surprised me

- A module could not read its own part's other modules, nor the vessel's pointing: both needed small `VesselApi` additions, since "keep the check in the module" (the plan's note) cannot be done without them.
- The target defaults to the body below, so a telescope that has not been aimed anywhere looks at the planet: the run reason says how far off it is.

## Open questions / follow-ups

- The orbiter probe bus with its own engine and the high-gain antennas on arms stay an open choice of the owner (plan 298, Scope).
- The Hangar and the flight science panel show the reason on the experiment already; a "Point at target" shortcut is not here.

## Verification output

```
bun run lint ✓ · bun run check:affected: prettier, docs:check, typecheck (15 workspaces and web) ✓; bun test 2362 pass, 0 fail (14 workspaces); web vitest (related) ✓
check-affected: all passed in 710.8 s
CI: not waited for (merge-first rule); it runs on main after the merge
```
