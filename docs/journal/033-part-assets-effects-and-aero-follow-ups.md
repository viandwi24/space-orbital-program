# 033 — Part follow-ups 2: gimbal, damping, control surfaces, smoke, debris, plasma, glTF

**Plan:** plans/033-part-assets-effects-and-aero-follow-ups.md · **Session:** control session (Claude, 2026-10-17) · **ADRs:** [0045](../decisions/0045-engine-gimbal-and-control-mixing.md), [0046](../decisions/0046-fin-damping.md), [0047](../decisions/0047-asset-provider-and-effect-techniques.md) · **Research:** [gimbal-damping-and-effects](../research/gimbal-damping-and-effects.md)

## What was done

The draft was refined to `ready` at the human's request (research, three ADRs, measurable criteria, the large items pushed to drafts [040](../plans/040-effects-and-assets-3.md) and [041](../plans/041-aero-and-structure-extras.md) with a reason each), then implemented gameplay first, looks second.

| Where | What |
|---|---|
| `packages/core`, `packages/sim` | API 0.1.10: `VesselApi.centreOfMass` (body centre of mass in the part frame, flight only) and `torqueDemand` (the attitude demand as a torque direction in the part frame); `PartVisual.articulation` |
| `mods/stock` | `steering.ts` (the one mixing rule, `gimbalTarget`, `surfaceTarget`, `slew`); `stock.engine` `gimbal: { range, rate }` (state and snapshot `gimbal`; LV-T30 3 degrees, 20 degrees/s); fin `damping` (default 60); `stock.control-surface` module and part |
| `packages/renderer` | articulated parts (`ctx.moving`, pivot, `articulation.ts`): the engine bell, chamber and plume swing with the gimbal, the control-surface plate turns; `control-surface` generator; lit sphere-impostor smoke with a quintic noise, wind drift (`windAt`), dust colour from the ground (`dustColour`, water spray), plume ground light (`GroundGlow`, `plumeGroundLight`), debris cut from the destroyed parts' real meshes (`shards.ts`, one dynamic mesh), plasma colour by speed (`ionisationColour`), `GltfPartProvider` with `fallbackKind` |
| `apps/web` | `categories.ts`, `stability.ts`, `checks.ts` treat the control surface like a fin (category, stability read-out, "fins ahead of the centre of mass" warning) |

## Verification

| Criterion | Evidence |
|---|---|
| Gimbal torque equals the hand calculation | `packages/sim/test/gimbal.test.ts`: pod, two tanks, engine, no wheel, 0.2 throttle in vacuum, full pitch demand for 1 s: the angle is `T sin(3 deg) * arm / I` with the ramp of the slew and the mean of the start and end mass properties: expected 0.08992 rad, got 0.08985 (0.08 %; a half-step lead of the 20 ms step is in the hand number, documented in the test); yaw about Z likewise; the opposite demand turns the other way; half demand gives half the turn (ratio 0.48 to 0.52); no demand: angles under 1e-9 and `gimbal` `[0, 0]`; an engine without gimbal does not turn; slew is `rate * dt` per step, holds 3 degrees, returns to 0 |
| Mixer, controller and unit torque | `mods/stock/test/steering.test.ts`: demand fraction is deflection fraction, sign follows the lever (engine above the centre of mass steers the other way), less authority under 1 m, `r x F` torque of the engine (T sin 3 deg * 6 m = 67.5 kN m), control surface at 25 degrees in 0.09 kg/m3 at 1 km/s gives the hand normal force within 5 %, backward flow reverses the sign |
| The 23-part finned rocket with ONE reaction wheel reaches orbit | `booster-ascent.test.ts`: `saturn(1)` with the plan 026 profile: periapsis 76.4 km, e 0.0854, done at 308 s (three wheels: 76.8 km, e 0.0847). **The criterion's second half failed as written:** the same rocket with `test.engine-fixed` (no gimbal) also reaches orbit in the headless loop (periapsis 76 to 77 km on four profiles). The failure of journal 026 was in the browser autopilot (snapshot rate and worker latency), not in the sim. The criterion became an authority test instead: |
| Authority at max-q | `gimbal.test.ts` "authority at high dynamic pressure": 8 km, 400 m/s, no angle of attack, full pitch demand for 3 s, peak nose swing: one wheel 2.2 degrees, three wheels 6.2, one wheel plus gimbal 13.0 (5.9 times the wheel alone, 2.1 times three wheels; asserted at 4 and 1.5) |
| Fin damping | `fins.test.ts`: coasting finned booster rocket at 1.5 km/s, 20 km, 6 degrees off: peaks of the angle of attack with the stock damping 4.05, 2.88, 1.91 (one period later: 0.47 of the first, asserted at 0.6); with `damping: 0` (`test.fin-undamped`, the plan-026 force) 6.16, 6.43, 6.67 (1.08, asserted above 0.9); the original 4-degree test (under 8, bare past 30) still passes |
| Control surface | `control-surface.test.ts`: four surfaces on a coasting rocket at 1 km/s: pitch +1 turns it +0.5975 rad about X in 1.5 s, -1 turns it -0.5968, 0 leaves it (3e-4); yaw turns about +Z, roll about +Y (all four deflect the same way round the axis); determinism (identical JSON) |
| Determinism | gimbal, control-surface and `determinism.test.ts` runs are byte-identical twice; `determinism.test.ts` demands were lowered tenfold (0.002 pitch) because a held 2 % demand now overturns the rocket through the bell in 10 s (the test's point is the identical runs, not the flight) |
| Renderer maths | `look.test.ts` (dust colour, wind, ground light, ionisation colour, wind in the pool, tint through removal), `shards.test.ts` (triangles with areas and colours from a real geometry and from the stock tank, area-weighted deterministic picks, prism, destroyed events carry `definitions`), `articulation.test.ts` (bell and plume follow the gimbal, plate follows the deflection), `gltf-provider.test.ts` (an embedded glTF box parses to 12 triangles with bounds, nodes, clones; missing and malformed assets decline; the factory falls back to the named generator, then to the shape) |
| Repo checks | `bun test`: 1 011 pass, 1 skip, 0 fail (125 files); `apps/web` vitest 342 pass; `bun run typecheck` 0 errors (svelte-check 1 352 files); `bun run build` ok; prettier clean on every file touched; `bun run docs:check` reports only plans 035 and 036 missing from the board (plan 032's session) |

## `[manual]` screenshots

Built-in browser (Apple M5), own Vite server on port 5195 with a temporary config that ignored other sessions' files and wrote screenshots through a dev endpoint (deleted with the launch entry); the pane was hidden, so frames were driven from the console and the sim was paused with the pause menu. The vessel is the Saturn of plan 026 with one wheel and, alternately, fins and control surfaces. Canvas captures at 1600 x 900 with a text caption, `high`.

| File | Shows |
|---|---|
| `assets/033-liftoff-smoke.png` | liftoff at T+8 s, 19 m up: the lit billowing cloud over the pad, tan on the concrete and grass; the plume lights the pad |
| `assets/033-gimbal.png` | the core engine at 5 % throttle with full pitch demand: the bell leans 3 degrees against the tank column |
| `assets/033-control-surface.png` | the two control surfaces on a rocket under a pitch demand, deflected +14.6 and -14.6 degrees (opposite corners turn opposite ways) |
| `assets/033-debris.png` | a destroyed Saturn 2.1 s after impact (synthetic snapshot: the vessel removed from a moving one): 47 pieces cut from its parts, tank paint, metal bands, the orange booster cones |
| `assets/033-plasma-orbital.png`, `-slow.png`, `-fast.png` | the shock layer at 7.8 km/s (pink-white), 3.5 km/s (orange) and 11 km/s (blue-white); synthetic snapshots with the stack falling engines first |

**Frame times** (1920 x 1080, ratio 1, `high`, `benchmark(60)` four times, hidden pane): the pad with the Saturn idle 23.3 to 24.2 ms; with the whole effects group hidden against shown, 24.0 and 24.5 against 24.7 and 24.0 (no difference); with the engines burning at 16 m (smoke, ground glow, plume): all 23.9 and 23.8, glow off 23.3 and 23.8, effects hidden 24.0 and 23.0. The absolute figure is 8 ms above plan 031's 16.0 ms because this pane and machine were in the slow state journal 031 describes (the hidden pane, a shader set loaded twice), so the comparison with 031 is not possible from this run; the changes of this plan added no measurable cost at the pad, burning or not (within +-0.5 ms noise), and the planet pass dominates. A before/after on the same session was not done (no second checkout could be run without touching other sessions' files). Smoke has a heavier fragment shader but the same instance count; the glow is at most four discs.

## Self-review against `product/visual-direction.md`

The question: would a KSP/KSP2 player take the rocket seriously?

| Aspect | Verdict |
|---|---|
| Steering | Met. Normal rockets steer with a bell, the player and the scripts feed the same attitude demand; a finned rocket no longer needs three wheels (authority 6 times one wheel at max-q). The old failure in the browser was not reproduced headless; the human should fly one wheel by hand and by the autopilot to confirm. The gains of the shipped autopilot and of scripts were tuned for a 5 kN m wheel and are untouched. |
| Fin damping | Met as a model, honestly a fudge: the quasi-steady damping of a fin is about 1 % of what a pitch loop needs, so the stock fin counts the rotational flow 61 times (ADR 0046). A rocket now settles in a period or two; the constant is tuned, not measured. |
| Control surface | Met as a part. All-moving plate, mixer by lever arm; roll gets only the share of the range that points that way (30 % for a tall rocket); no flaps or ailerons, no trim, no wing lift (draft 041). |
| Smoke | Better, not release quality. The puffs are lit, billow, drift and take the ground's colour, and the pad cloud now reads as a cloud; it is still a field of camera-facing billboards with no depth fade (the plan's soft-particle technique needs a depth texture), the noise shows a faint blockiness on the biggest puffs at 1600 px, nothing is lit from inside by the plume, and the trail in the air column is the old thin one (draft 040). |
| Plume ground light | Weak. The disc is physically placed and scaled, but under the smoke cloud it is hard to see in the screenshots; a point light would sell it and costs every material (ADR 0047). |
| Debris | Better. Pieces are real triangles of the destroyed parts in their paint colours; they are thin prisms with no thickness variation, the fireball hides them for the first second, nothing stays on the ground (draft 040). |
| Plasma | Colour by speed is right and visible; the shell is still a sphere sized by the lateral extent of the stack, the wake a cone; no silhouette shape, no blackout (draft 040). |
| Gimbal visibility | 3 degrees is true to a real engine and easy to miss on screen; the bell, the plume and the part's own flame follow it, but there is no HUD read-out of the gimbal (a new component would be one line in `routes/flight`, owned by plan 032's session). |
| glTF provider | Works in Bun with an embedded document and with the fallback; not exercised in a browser with a real model, no stock asset exists, parts built from assets have no plume or articulation, no KTX2 (draft 040). |
| Performance | No measurable change at the pad (above); no M1/M2/Intel measurement possible. |

It is closer to the bar than before (the rocket flies as a rocket and the big look gaps are narrower) but it is not release-quality smoke or plasma, and these notes say so.

## Surprises

- The headless one-wheel rocket did not fail without gimbal, contrary to journal 026; see the table. The authority test is the honest replacement.
- `determinism.test.ts` flew a 0.02 pitch demand for 10 s; with a bell that overturned the rocket and destroyed vessel 0 before the script's next command. It was a feature of the test, not of the sim.
- The first gimbal hand calculation was off by 2.3 %: the angle written at the start of a step acts over that step, a half-step lead. The test says so.
- The mixer divides by `|t|` for the direction but scales authority by the lever arm; a pure roll demand on four surfaces gives each only the share of its range along that direction (about 30 %), which is correct for the rule and weak for roll.
- `three`'s `FileLoader` reports data: URIs with a `ProgressEvent`, which Bun does not define; the test defines a stand-in. Browsers have it.
- `bunx prettier --write src` in the renderer touched `site-meshes.ts` (another session's file, a one-line change); reverted. Prettier is run on named files only.
- The pause menu's Escape does not resume; the Resume button does.

## Not done / found, not done

- Drafts [040](../plans/040-effects-and-assets-3.md) (wreckage, plasma shape, comms blackout, persistent trail, multi-nozzle, KTX2, devices) and [041](../plans/041-aero-and-structure-extras.md) (struts and fuel lines, tilted parts, non-cylindrical radial parents, wing lift).
- A gimbal read-out in the HUD (a separate component plus a line in `routes/flight/+page.svelte`, plan 032's file), and the dev autopilot and scripts gaining gains for the stronger actuator.
- M1/M2 and Intel frame times; a before/after frame table on the same session.
- The VAB shows the control surface in the catalogue (category "Aerodynamics") and in the stability read-out, but the screenshot of it in the VAB was not taken (the flight screenshot shows the part).
