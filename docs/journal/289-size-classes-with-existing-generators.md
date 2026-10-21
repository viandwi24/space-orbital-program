# 289 — Size classes to 7.5 m with the existing generators

**Plan:** [plans/289-size-classes-with-existing-generators.md](../plans/289-size-classes-with-existing-generators.md) · **Session:** Worker E (Agent 3, Linux), 2026-10-21

## What was done

| Where | What |
|---|---|
| `packages/core/src/node-size.ts` | `NODE_SIZES` holds the seven classes of ADR 0256: 0.625, 1.25, 1.875, 2.5, 3.75, 5 and 7.5. This changes size inference for mods, so the API goes to 0.1.96 (patch: additive). |
| `mods/stock/src/parts/tanks.ts` | `liquidTank` (`wideTank` generalised to any class) and `classTank`. `classTank` scales fuel and dry mass by volume from `stock.tank-wide`. 11 tanks. |
| `structure.ts` | `classDecoupler`: mass and ejection impulse grow with diameter² from the wide decoupler. 4 decouplers, 5 adapters (`adapterPart`) and 4 fairing bases (`fairingBase`). |
| `aero.ts` | Four nose cones from the cone list (`NOSE_CLASS_SIZES`), with no tail cones (not in scope) |
| `recovery.ts` | `classHeatShield`: mass and ablator grow with area from the 1.25 m shield. Shields to 5 m. |
| `docking.ts` | One 3.75 m port (`port`). Ports stop at 3.75 m. |
| `parts/index.ts`, `index.ts` | `STOCK_SIZE_CLASS_PARTS`, registered after every older part |
| `tech.ts` | The 0.625 m tank goes in Structures and the 1.875 m set in Heavy lift. The 3.75 m port goes in Docking, and the 1.875 and 3.75 m fairing bases in Fairings. The rest of the 3.75, 5 and 7.5 m set goes in the new tier-5 node `stock.super-heavy-lift` (300 science, after a Cinder landing). Tier 5 is outside the pacing sums of `tech.test.ts`. |
| Tests | Core: the seven classes, and 1.9 m size-less inferring 1.875. Stock: a fixture of every stock node size from before the change (`test/fixtures/node-sizes-before-289.json`, 60 parts) still matches, and every new node is a class. Boot ids. Seams: 3 exemptions. Sim: the 7.5 m pad test. |
| Docs | Mod guide (the seven classes and the inference note), `architecture/plugin-system.md`, and the parts tracker (rows TNK-03/04, CPL-01/04, STR-01, PAY-01, AER-01 and THR-01, plus the OrbitX codes used) |

Titles follow ADR 0255: `OrbitX <code>-<class><variant> "<nickname>"`. The class is the two-digit diameter (18 = 1.875 m); S, M and L mean short, medium and long. Existing parts keep their titles.

## The new parts

| id | Title | Node sizes, m | Height, m | Dry, kg | Fuel / oxidizer, u |
|---|---|---|---|---|---|
| `stock.tank-0625` | OrbitX BT-06 "Butir" | 0.625 | 0.75 | 25 | 18 / 22 (0.2 t full) |
| `stock.tank-1875-short` | OrbitX BT-18S "Tong" | 1.875 | 1.9 | 570 | 410 / 501 (5.1 t full) |
| `stock.tank-1875` | OrbitX BT-18M "Tong" | 1.875 | 3.75 | 1125 | 810 / 990 (10.1 t full) |
| `stock.tank-3750-short` | OrbitX BT-37S "Tong" | 3.75 | 1.9 | 2280 | 1642 / 2007 (20.5 t full) |
| `stock.tank-3750` | OrbitX BT-37M "Tong" | 3.75 | 3.75 | 4500 | 3240 / 3960 (40.5 t full) |
| `stock.tank-3750-long` | OrbitX BT-37L "Tong" | 3.75 | 7.5 | 9000 | 6480 / 7920 (81.0 t full) |
| `stock.tank-5000-short` | OrbitX BT-50S "Tong" | 5 | 2.5 | 5335 | 3840 / 4693 (48.0 t full) |
| `stock.tank-5000` | OrbitX BT-50M "Tong" | 5 | 5 | 10665 | 7680 / 9387 (96.0 t full) |
| `stock.tank-5000-long` | OrbitX BT-50L "Tong" | 5 | 10 | 21335 | 15360 / 18773 (192.0 t full) |
| `stock.tank-7500` | OrbitX BT-75M "Tong" | 7.5 | 7.5 | 36000 | 25920 / 31680 (324.0 t full) |
| `stock.tank-7500-long` | OrbitX BT-75L "Tong" | 7.5 | 15 | 72000 | 51840 / 63360 (648.0 t full) |
| `stock.decoupler-1875` | OrbitX RS-TD18 "Pisah" | 1.875 | 0.22 | 110 | — |
| `stock.decoupler-3750` | OrbitX RS-TD37 "Pisah" | 3.75 | 0.3 | 450 | — |
| `stock.decoupler-5000` | OrbitX RS-TD50 "Pisah" | 5 | 0.35 | 800 | — |
| `stock.decoupler-7500` | OrbitX RS-TD75 "Pisah" | 7.5 | 0.45 | 1800 | — |
| `stock.adapter-1250-1875` | OrbitX RS-AD12-18 "Corong" | 1.25 / 1.875 | 0.6 | 70 | — |
| `stock.adapter-1875-2500` | OrbitX RS-AD18-25 "Corong" | 1.875 / 2.5 | 0.6 | 100 | — |
| `stock.adapter-2500-3750` | OrbitX RS-AD25-37 "Corong" | 2.5 / 3.75 | 1.2 | 300 | — |
| `stock.adapter-3750-5000` | OrbitX RS-AD37-50 "Corong" | 3.75 / 5 | 1.2 | 450 | — |
| `stock.adapter-5000-7500` | OrbitX RS-AD50-75 "Corong" | 5 / 7.5 | 2.4 | 1200 | — |
| `stock.fairing-base-1875` | OrbitX PF-18 "Kubah" | 1.875 | 0.2 | 120 | — |
| `stock.fairing-base-3750` | OrbitX PF-37 "Kubah" | 3.75 | 0.2 | 300 | — |
| `stock.fairing-base-5000` | OrbitX PF-50 "Kubah" | 5 | 0.2 | 450 | — |
| `stock.fairing-base-7500` | OrbitX PF-75 "Kubah" | 7.5 | 0.2 | 800 | — |
| `stock.nose-cone-1875` | OrbitX AC-18 "Runcing" | 1.875 | 1.65 | 85 | — |
| `stock.nose-cone-3750` | OrbitX AC-37 "Runcing" | 3.75 | 3.3 | 340 | — |
| `stock.nose-cone-5000` | OrbitX AC-50 "Runcing" | 5 | 4.4 | 600 | — |
| `stock.nose-cone-7500` | OrbitX AC-75 "Runcing" | 7.5 | 6.6 | 1350 | — |
| `stock.heat-shield-1875` | OrbitX PR-HS18 "Perisai" | 1.875 | 0.25 | 180 | — |
| `stock.heat-shield-3750` | OrbitX PR-HS37 "Perisai" | 3.75 | 0.4 | 720 | — |
| `stock.heat-shield-5000` | OrbitX PR-HS50 "Perisai" | 5 | 0.5 | 1280 | — |
| `stock.docking-port-3750` | OrbitX DP-37 "Jabat" | 3.75 | 0.5 | 350 | — |

The 0.625 m tank scales from `stock.tank-wide` as the plan says. That makes it small (18 u of fuel), because the 1.25 m tanks hold about twice as much per m³ as the wide ones.

## Inference change for mods

A size-less stack node of a cylinder now takes 1.875 when the cylinder is between 1.53 and 2.17 m across:

- from 1.53 to 1.77 m, it took 1.25 before;
- from 1.77 to 2.17 m, it took 2.5.

Every stock part declares its sizes, and the fixture test shows none changed. Mods with size-less parts in that range should declare `size`. The mod guide says so.

## Seams

There are three new `NOT_A_FLAT_JOINT` exemptions, all with the existing reason "the ablative dish faces the airflow at the end of a stack":

- `stock.heat-shield-1875/bottom`
- `stock.heat-shield-3750/bottom`
- `stock.heat-shield-5000/bottom`

The 1.25 m and 2.5 m shields already had this exemption. No other new part needed one.

## Pad test (`packages/sim/test/size-classes-pad.test.ts`)

The stack, top to bottom:

- `stock.probe-core`;
- the adapters 1.25 → 1.875 → 2.5 → 3.75 → 5 → 7.5;
- `stock.tank-7500`, with six `stock.srb-large` on `stock.radial-decoupler`s around it.

The tank starts empty through its fill setting. Full, it is 324 t, against the six motors' 1.8 MN. A throttle command takes the vessel off the pad's rails into physics, while the solid motors wait for their stage.

- **Standing:** it rests for 99 steps in physics, then goes back to surface rails after the 2 s rest of ADR 0024. Over the 5 s, the largest vertical drift was 0.011 mm and the largest tilt 0.026°. The limits are 5 cm and 1°.
- **Lift-off:** after the stage, it climbs 111 m in 5 s with no tilt. The limit is more than 20 m.

## Verification

These were run on the Linux worker (i5-8265U, 5.8 GiB), one at a time under the heavy-job lock and `nice`. By ADR 0126, only the touched packages were run here; CI runs the full suite.

- **`bun test packages/core`:** 357 pass, 0 fail.
- **`bun test mods/stock`:** 152 pass, 1 fail. The failure is `patch-bench`'s "1 000 patches in under 50 ms (M5; indicative elsewhere)": 1,136 ms here, and 1,084 ms on `main` without this plan, so it is the machine.
  - The snapshot diff has 438 lines, all of them additions.
- **`bun test packages/renderer/test/part-seams.test.ts`:** 5 pass, with the 3 exemptions above.
- **`bun test packages/sim`:** 616 pass, 12 fail, all on wall time. Run with `--timeout 60000`, the timed-out files pass (30 of 30): heating, debris, scenario-orbit, objectives and milestones. The other failures are three career bots ("under 45 s"; about 46 s here) and the 0.5 ms world-tick benchmark. None of them touch the new parts. The new pad test passes.
- **`bun run typecheck`:** 0 errors. **`bun run build`:** done, run alone with no browser. **`bun run docs:check`:** OK.
- **Optional catalogue screenshot:** not taken. Browser runs are paused on this machine (owner, 2026-10-20), and the parts are checked headless by the visuals and seams tests.
