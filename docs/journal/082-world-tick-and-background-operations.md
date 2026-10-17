# 082 — World tick and background operations

**Plan:** plans/082-world-tick-and-background-operations.md · **Session:** Agent 3 (Dev C, Linux Mint, 2026-10-17), three-agent team mode · **ADRs:** [0171](../decisions/0171-world-tick-day-length-timing-and-save-fields.md) (new), [0096](../decisions/0096-world-tick-background-operations-and-a-living-world.md) · **Research:** none

**Status when written: criteria met here, handed over as `ready/082`.** The ¹ benchmark number below is indicative; Agent 1 runs it on the M5.

## What was done

| Where | What |
| --- | --- |
| `packages/sim/src/tick.ts` (new) | `dayLength`, `dayAt`, `dayStart`, `orderTickSystems`, `createTickState`, `saveTickState`, `runDueTicks`, `runBackground`, `hasBackground` |
| `packages/sim/src/sim.ts` | `railsStep` cuts chunks at boundaries and snaps `t` to them; `flightStep` ticks at its end; `SimCore.ticks` built with the system order |
| `packages/sim/src/hooks.ts`, `modes.ts`, `commands.ts`, `save.ts`, `state.ts`, `core.ts` | `background` replaces `updateOnRails` on rails; `backgroundAt` set when loading on rails or going on rails, closed forms caught up at wake and before a save; `worldTick` written |
| `packages/core` | `SystemPhase` `world-tick`, `SystemDefinition.order`, `SystemContext.tick` (`WorldTick`), module `background`, event `world:tick`, `streamSeed`, optional `SimSave.worldTick`; `API_VERSION` 0.1.29 |
| `packages/sdk` | `WorldTick` exported; compile-time tests |
| tests | `packages/sim/test/world-tick.test.ts` (8 tests); `save-format.test.ts` checks the new `worldTick` of the frozen format-1 fixture |
| docs | ADR 0171, `simulation.md` (world tick, background, save), `plugin-system.md`, guide open items; draft 190 (stock solar panel) |

## Decisions and deviations

- **Day length** is the root body's `rotationPeriod` until 081 brings the calendar (ADR 0171 point 1). If 081 defines the solar day differently, it changes `dayLength` in one place.
- **The flight step is not split.** The tick comes at the end of the 20 ms step, with the exact boundary as its `time`.
- **Save:** an optional `worldTick` in format 5, with no format bump and no reserved number. The default can be derived, so older saves need no migration.
- **`commands.ts` edited** although Touches does not name it: a vessel that is loaded straight onto rails needs its `backgroundAt`. No contract changes there.
- **Benchmark body.** 1 000 stock days at warp 1e6 take 2.16 million rails chunks: about 255 s here with 50 vessels, almost all of it rails propagation, not the tick. The benchmark uses a root body with stock's mass and radius and a 10 s day, so it times the tick itself. That covers the background calls for the 50 vessels, the world systems and the event. It is measured from the end of the chunk that stops at the boundary, where a `post-physics` marker runs, to the `world:tick` event.
- **Stock example** of a background producer: stock has electric charge but nothing that makes it, so the example is a test fixture (a battery charged by a panel), and the stock solar panel is draft 190.

## Numbers

- Benchmark (indicative, this machine): `1000 ticks, 50 vessels on rails with background: 0.0565 ms per tick on average` (budget 0.5 ms on the M5).
- 100 game days at warp 1e6 without vessels: 216 000 rails chunks plus 100 ticks, inside the 8 tick tests' 0.9 s total.

## What surprised me

- The first version gave every on-rails vessel a `backgroundAt`, which broke the frozen-fixture save equality test. Now only vessels with a `background` module carry it, so saves of stock flights are unchanged except for the new `worldTick` block.
- A vessel loaded straight onto rails (any `state` placement in a stable orbit) never passes through `toRails`. Without the extra line in `commands.ts` its background started counting at the first tick instead of at the load.

## Follow-ups

- 081 (Agent 2): the calendar should use `dayLength` from `packages/sim/src/tick.ts`, or replace it, so ticks and dates agree.
- At maximum warp a burst of ticks runs inside one step. Spreading them over frames is left until a system's cost needs it (ADR 0096 Consequences).
- Draft 190: stock solar panel.

## Verification output

See the `ready/082` tag message.
