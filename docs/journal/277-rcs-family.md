# 277 — The RCS family

**Plan:** [plans/277-rcs-family.md](../plans/277-rcs-family.md) · **Session:** part visuals session (Claude), 2026-10-21, on `main` after plan 291

## What was done

| Where | What |
|---|---|
| `packages/renderer/src/parts/generators/rcs-block.ts` | Rewritten with the detail kit, after the owner's reference (the revamped RV-105 card): a dark base plate with corner bolts, a rounded white housing (a rounded rectangle extruded from the plate) with a dark seam band, an inset keypad panel (3 × 4 keys, one accent key), and per nozzle a stub pipe, a dark collar and a ribbed, hollow bronze bell. The housing shrinks to leave room for every nozzle |
| Same file | The bells come from `visual.puffs.nozzles`, the list the part's `stock.rcs` module fires. A nozzle's `pos` is the centre of its bell's exit and the exhaust leaves along `-dir`. Parts without puffs get the plan 211 layout from `params.nozzles` |
| `mods/stock/src/parts/rcs.ts` | `stock.rcs-block-5` (the 4-way cross plus one nozzle out of the front, 60 kg), `stock.rcs-pair` (up and down only, 30 kg), `stock.rcs-linear` (one nozzle, 20 kg). All are monopropellant at 1 kN and Isp 240/100 s like the block. The five thrusters are renamed in the `OrbitX <code> "<nickname>"` form plan 289 used: OrbitX RCS-4 "Kompas", RCS-5 "Bintang", RCS-2 "Sepasang", RCS-1 "Tunggal", CG-1 "Hembus" (ADR 0255) |
| `mods/stock/src/tech.ts` | The three new parts are in Reaction control |
| Tests | `rcs.test.ts`: puffs equal the module's nozzles for every thruster, nozzles inside the box, the new layouts. `boot.test.ts`: ids and the radial-node exception list. Part-id snapshot: additions only. `apps/web/e2e/career-content.e2e.ts`: the block's new title (e2e not run, owner's instruction) |

## What surprised me

- **The sim positions of the existing parts did not change.** Drawing the bells at the module's own nozzles meant the 4-way block's model moved to its data, not the other way round, so no flight test changed.
- **A thin part makes tiny bells.** The bell size comes from the smaller of the part's height and depth. The pair at 0.14 m deep had 3 cm bells, so it is now 0.2 m deep.

## Decisions made

None new. The bipropellant thruster and the pitch, yaw and roll toggles moved to draft 299: `ModuleRcs` burns one propellant, and its torque demand is in the part frame.

## Open questions / follow-ups

- Plan 299.
- RCS ports in the shell of the new pods: plan 278.

## Verification output

```
bun test mods/stock + renderer parts, part-seams, parts-kit: 184 pass, 0 fail
bun run typecheck: no errors
prettier --check . (without another session's .claude/launch.json): clean; web lint: clean
bun run test (full, parallel load, load average about 5): 2104 pass, 1 fail
  the fail: career-bot.test.ts took 125 s against its 45 s timing bound (load);
  alone: bun test packages/sim/test/career-bot.test.ts -> 9 pass, 0 fail
apps/web CI=true bun run test: Tests 2 failed | 1372 passed; the two are the known
  sim-host-script-worker.test.ts failures that also fail on HEAD b767aeb0 (STATUS.md)
```

Icons: `refs/part-visuals-and-blueprints/img/icons-after/rcs-block.png`, `rcs-block-5.png`, `rcs-pair.png`, `rcs-linear.png`, `rcs-cold-gas.png`.
