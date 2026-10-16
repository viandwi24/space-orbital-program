# 026 — Radial parts, boosters and fins

**Plan:** plans/026-part-visual-follow-ups.md · **Session:** radial session (Claude, 2026-10-16/17) · **ADRs:** [0034](../decisions/0034-radial-attachment-symmetry-and-design-format-2.md), [0035](../decisions/0035-lifting-surfaces-air-velocity-capability.md) · **Research:** [fin-aerodynamics](../research/fin-aerodynamics.md)

## What was done

The draft was refined to `ready` at the human's request (two ADRs, measurable criteria, the effects that are not needed to build and fly boosters pushed to draft 033), then implemented in five commits plus docs.

| Where | What |
|---|---|
| `packages/core` | Design format 2: radial links (`parentNode: "surface"` + `radial { angle, y }`), `symmetry`, `ResolvedPart.yaw`, `migrateVesselDesign`, `PartDefinition.dragCoefficient`, reserved node name `surface`, `VesselApi.airVelocity`; API 0.1.7 to 0.1.8 |
| `packages/sim` | `PartState.yaw` (colliders, rotated inertia, part-frame drag, snapshots, hook forces, separation direction), `airVelocity`, `detach` cuts every link on a node, a stage's several detaches are applied as if simultaneous (`processPending`), `dragCoefficient` |
| `mods/stock` | `stock.radial-decoupler`, `stock.booster` (150 kN, Isp 270/250, 2 500 kg propellant, 450 kg dry), `stock.nose-cone` (`dragCoefficient` 0.12), `stock.fin` (module `stock.fin`, flat-plate normal force); decoupler `separates` accepts `radial` |
| `packages/renderer` | generators `radial-decoupler`, `booster`, `nose-cone`, `fin` (box shapes now go through the procedural provider, `GenContext.size`), `VabPart.yaw`, `pick` returns the hit point and can ignore the ghost, engine start-up ramp, ignition flash and shutdown fade (`stepEngineRamp`) |
| `apps/web` | editor: radial targets from a pointer hit (`siteOfPoint`, `snapRadial`, `radialTarget`), symmetry 1/2/3/4/6 (`planAttach`), copies on every member of a group, group delete/detach (Shift+Del for one), move leaves the group; auto-staging for boosters; `delta-v.ts` cuts every link on a node and ends a burn at booster burnout; VAB page: symmetry control (`X`), `Q`/`E` for keyboard sites, Alt frees the angle; catalogue category "Aerodynamics", icons `fin` and `cone`; dev autopilot takes `turnPitch`, `stageCount`, `jettisonAtCut` from `globalThis.__autopilot` |

## Verification

All commands from the repo root unless noted.

| Criterion | Evidence |
|---|---|
| Radial child resolves to hand values; refusals; v1 loads unchanged | `packages/core/test/design.test.ts` ("radial attachment"): 0.6 m / yaw 0 at angle 0, -0.6 m on Z / yaw pi/2 at a quarter turn, a booster on the turned `outer` node at -1.0 m; v1 with radial, box parent, duplicate site, vertical node, out-of-range height refused; `migrateVesselDesign` of a v1 design equals it apart from the version and resolves to a byte-identical result |
| 2 and 4 boosters assemble, separate symmetrically, momentum conserved, crossfeed | `packages/sim/test/radial.test.ts`: decoupler at 0.725 m and booster at 1.225 m from the axis (0.625 + 0.1, + 0.2 + 0.4), radial node facing the axis; separation: vessels +n, mass conserved to 1e-12, linear momentum to 1e-6 relative, centre of mass within 0.5 mm (the body's mass properties lag the burn by one step), all boosters leave at the same speed to 1e-4 m/s, radially; a booster burned only its own propellant and the core tank was drawn before the upper one |
| Fins: restoring moment, finned rocket stays near prograde, bare one diverges; determinism | `packages/sim/test/fins.test.ts`: `boosted(0, fins)` at 1 500 m/s, 20 km, 4 degrees off prograde, no commands: four fins stay under 8 degrees for 12 s (they come back through under 2), without fins the angle passes 30 degrees (101 degrees at 12 s in the exploration run); `radial.test.ts` boosted + finned flight with a separation is byte-identical twice; `scenario-orbit` and all 99 sim tests pass |
| Δv with boosters = hand Tsiolkovsky | `apps/web/src/lib/delta-v-boosters.test.ts`: stage 0 (core + 2 boosters, ends at booster burnout after 44.1 s) and stage 1 (core alone) match the hand intervals to 1e-9 relative, burn time and masses exact; the core tank's 400:490 mix (not exactly 0.9:1.1) is in the hand numbers |
| VAB editor tests | `apps/web/src/lib/editor/radial.test.ts` (16): pointer hit to azimuth and height, snapping, target equals the resolved position, refusals, 2/3/4/6-fold angles, one undo step, copies on every group member, preview, duplicate sites refused atomically, group delete/detach/move, auto-staging `[[core + boosters], [radial decouplers], [stack decoupler + upper engine]]` |
| Renderer generator tests | `packages/renderer/test/parts.test.ts`: every new model inside its shape, nodes touched, no NaN, budgets (flat plates at least 24 triangles); `plume.test.ts`: ramp rises monotonically, flash once, fade, independent of step size |
| Orbit | headless: `packages/sim/test/booster-ascent.test.ts` (four boosters and four fins, boosters separate at burnout, stack decoupler at the cut, 6-part upper stage on rails). Browser: see below |
| Repo checks | `bun test`: 845 pass, 0 fail (103 files); `apps/web` vitest: 287 pass; `bun run typecheck`: 0 errors (svelte-check 0 errors, 1 196 files); `bun run build` ok; `bun run docs:check` ok; prettier clean on every file touched |

### `[manual]` build, launch, separate, orbit

Built-in browser (Chromium in the Claude desktop app, Apple M5), own Vite server on port 5190 with a temporary config that did not watch other sessions' files (deleted with the launch entry). The core, a radial decoupler set (symmetry 4, placed by hovering the side of the lower tank and clicking), a booster on each decoupler (one click on a ring: copies on all four), nose cones (one click) and four fins (hover between two boosters, symmetry 4) were placed **by mouse** on the two-stage example (23 parts, 25.1 t, liftoff TWR 3.07, 5 017 m/s). The orbit run used a saved design with three reaction wheels instead of one (the same vessel the headless test flies; with one wheel the fins hold the rocket against the steering, see "Surprises"), `globalThis.__autopilot = { turnStart: 100, turnEnd: 12000, turnPitch: 1.1, apoapsis: 200000, stageCount: 1, jettisonAtCut: true }` and the dev autopilot (`P`). Sequence: lift-off, booster burnout at about T+44 s (toast "Engine flameout: BST-1 Booster"), the autopilot stages the radial decouplers, four debris vessels (3 parts each, apoapsis 175.2 km, equal to 0.05 km) leave, the cut at 200 km apoapsis, the stack decoupler fires, circularisation, "done: orbit reached": **214.0 x 76.1 km, eccentricity 0.093**, "Orbiting Home" at T+05:37. Screenshots (canvas captures, 1 920 px wide, preset `high`, HUD not included):

| File | Shows |
|---|---|
| `assets/026-vab-boosters-fins.png` | the finished vessel in the VAB: four boosters with cones on radial decouplers, four fins between them |
| `assets/026-liftoff.png` | liftoff, four booster plumes and the core plume at T+4 s |
| `assets/026-booster-plumes.png` | T+12 s, boosters burning with the core, fins visible |
| `assets/026-separation.png` | the boosters (with their decouplers) leaving symmetrically, core engine still burning |
| `assets/026-after-separation.png` | the core with fins after separation |

Frame times: VAB at 1440x900 CSS pixels, device ratio 2, `high`: 83 118 triangles, 280 draw calls, 4.0 ms CPU per `renderFrame` (moving average), 0.5 ms median; flight HUD paint 0.23 ms and model 0.15 ms per frame on the main thread over 3 552 frames. GPU time was not measured; M1/M2 and Intel are not measured (draft 033).

## Self-review against `product/visual-direction.md`

The question: would a KSP/KSP2 player take the rocket seriously? Honest answers.

| Aspect | Verdict |
|---|---|
| Building a Saturn-style rocket | Met. Boosters, cones, fins and symmetry work by mouse; copies appear on every decoupler at once; the stage list shows the boosters in their own stage with the right Δv. The pointer-driven radial placement is the weakest piece of UX: no snapping to the end of a part beyond a 0.2 m pull, the ghost of hidden copies is invisible, and moving a part leaves its symmetry group. |
| Part looks | Mostly met. The booster, cone and fin read as rocket hardware; the radial decoupler is a plain clamp and small. The fin is a flat plate with a root rail; no panel lines on the booster nose; the cone is a single colour. At catalogue size the booster icon is thin. |
| Flight look | Met for the plumes (four booster plumes plus the core, ramped start-up and fade); not met for smoke, which is still the plan-020 billboards, and the separation has no gas puff of its own beyond the existing split puff. Debris boosters are intact models falling away, which looks right; when they burn up they are boxes (plan 020). |
| Physics feel | Fins work and are tested, but the rocket is only neutrally stable (oscillates 0 to 7 degrees without damping), and a finned rocket resists the reaction wheel at high dynamic pressure: the 25 t vessel could not pitch over with one wheel. Players need gimbal or a stronger wheel (draft 033). |
| Performance | 83 k triangles and 280 draw calls in the VAB for 23 parts: fine on an M5, a risk on integrated GPUs; symmetric copies should be instanced (draft 033). |

It still falls short of KSP2 in the places above, but a player can build, fly and separate a booster rocket and reach orbit, which was the gap. The plan's remaining wishes are in draft 033.

## Surprises

- The first fin tuning (area 1.1 m2) stabilised only slowly; 2.2 m2 oscillated with a 5 s period and no damping; 1.5 m2 (1.6 in the first run) is the compromise. Damping from the fins' own velocity is small (the fins are 1.7 m from the centre of mass, the airspeed 1 km/s). No aerodynamic damping term was added.
- With four boosters (TWR 3) the scripted ascent cut the throttle at 80 km apoapsis after 37 s, before the boosters were empty, and circularised against the wrong thrust estimate; the test cuts at 200 km and jettisons at the cut. The ascent helper gained `stageCount` and `jettisonAtCut`.
- Sequential splitting gave later boosters the recoil of earlier ones (speeds 1.52 and 1.96 m/s for two boosters). A stage's detaches are now planned against the pre-cut vessel and applied together (`processPending`).
- A booster's propellant capacities 220:270 u were not the engine's 0.9:1.1 mix, so the fuel ran out 3 s before the oxidiser; 225:275 is exact. The core tank (400:490) is still not, and the hand test says so.
- The nose-cone generator drew the ogive upside down (a vase) until the browser showed it.
- Radial rings for the keyboard sites made the vessel unreadable and swallowed pointer picks; they show only after a key press (`radialMarkers`).
- Capturing from `renderer.render()` outside the page's frame produced a stale camera; the captures run inside a `requestAnimationFrame` after the page's own frame.
- `delta-v` first ended a stage only at total burnout, which made the boosters' dead mass ride along in the second stage's number; the stage now ends when an engine that the next stage drops runs dry.

## Not done / found, not done

- Everything in draft plan 033: asset provider, volumetric smoke, real debris shards, plasma shape, M1/M2 tuning, gimbal, control surfaces, struts and fuel lines, tilted parts, non-cylindrical radial parents, a stability read-out (centre of pressure against centre of mass) in the VAB, instanced symmetric copies.
- The VAB does not warn about an unstable design (no fins, or fins ahead of the centre of mass).
- Boosters share the vessel throttle and stop when they separate (ADR 0021: debris has throttle 0); a real solid booster would burn on.
- Moving a symmetric part moves only that part (it leaves the group); group move and an angle slider are for plan 029.
- Descriptor `engine` has no direction; fine while yaw is the only rotation.

## For plan 029 (VAB follow-ups) and 023 (release review)

- 029: `AttachTarget` has `radial`, `planAttach` is the one place copies are made, the symmetry group is `parts[i].symmetry`; a vessel library must store format 2 (`migrateVesselDesign` upgrades older files); sub-assemblies with radial links keep their angles (the root of a radial assembly is a normal part, its `radial` is in the parent link only); group move, an angle slider and a stability read-out are open; the category "Aerodynamics" is derived from `ModuleFin` and `dragCoefficient` in `categories.ts` (mod-supplied categories would replace it).
- 023: public-release blockers from this plan: smoke and plume ground light (033), gimbal (finned rockets resist the wheel), no device measurements, the radial pointer UX above. The dev autopilot overrides (`globalThis.__autopilot`) are dev only.
