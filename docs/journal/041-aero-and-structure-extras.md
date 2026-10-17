# 041 — Struts, fuel lines, tilted parts, radial attachment to boxes, wing lift

**Plan:** plans/041-aero-and-structure-extras.md · **Session(s):** structure session (Claude, 2026-10-17) · **Date:** 2026-10-17 · **ADRs:** [0071](../decisions/0071-format-3-connector-parts-tilt-and-box-radial.md), [0075](../decisions/0075-wing-lift-and-drag-polar.md) · **Research:** [wings-struts-fuel-lines](../research/wings-struts-fuel-lines.md)

## What was done

| Where | What |
|---|---|
| `core/src/design.ts`, `protocol.ts`, `protocol-schemas.ts`, `schemas.ts`, `version.ts` | format 3: `tilt`, `link`, radial links to boxes; `PartDefinition.connector`, `ModuleInfo.engine.axis`; `ResolvedPart.rotation/tilted/link`; `placeStack`, `placeRadial`, `surfacePoint`, `surfaceSite`, matrix helpers (the editor reuses them); `migrateVesselDesign` gives 3; API 0.1.19 |
| `sim/src/{state,parts,vessel,frames,hooks,mass,snapshot,resources,save}.ts` | `PartState.rotation?` (only for tilted parts, so old saves and designs are bit for bit unchanged) and `PartState.link?`; collider, inertia tensor, forces, `torqueDemand`, `centreOfMass`, separation direction, snapshot orientation, placement low point through the rotation; a split clears links whose ends land on different vessels; `reachableParts` visits the sources of fuel lines first; `PartSnapshot.link` |
| `mods/stock` | `stock.wing` (module with `wingCoefficients`, `wingForce`, `wingLiftSlope`), parts `stock.wing`, `stock.strut`, `stock.fuel-line` |
| `renderer/src/parts` | generators `wing`, `strut`, `fuel-line`; `ConnectorBars` (one scaled cylinder per link, shared by the flight scene and the VAB); `VabPart.rotation`, `VabScene.links`, picking through bars |
| `apps/web/src/lib/editor`, `vab`, `delta-v.ts`, `routes/vab` | `setTilt`, `planConnector`/`attachConnector` (symmetric pairing by group), box radial sites, cut and delete rules for links, tilt sliders, the connect mode (click, click; or select with `]` and Enter), stability counts wings (calibre is the widest cylinder), Δv with fuel lines and tilted engines, examples (asparagus rocket, glider) |
| tests | core 12 new (`design-v3.test.ts`) and 3 edited, stock 10 (`wing.test.ts`), sim 18 (`connectors` 9, `tilted` 4, `glider` 3, `asparagus-ascent` 2), renderer 8 (`connector.test.ts`; its cases cover bounds, budgets, bars, flight scene and VAB layer), web 19 (`connectors.test.ts` 12, `delta-v-lines.test.ts` 5, examples 2) |

## Decisions that changed on the way

- **Tilt about the parent's axes, not the part's own.** The first version tilted in the part's frame. A wing pair (angles 0 and pi) with the same tilt then had opposite incidence in the vessel (a rotation by pi about the vertical is not a mirror), so one wing lifted and the other pushed down. Applying the tilt before the part turns to face the surface makes equal tilts mirror images, which is what a plane wants (ADR 0071 point 5); the price is that four fins with one tilt are not rotationally symmetric.
- **Wing damping is off by default.** With the fin's extra damping of 30, the 5.9 t glider's attitude quaternion oscillated from step to step within a second (the wings sit 2 m from the roll axis: `(1 + damping) dt c / I` is above 1). The quasi-steady damping that `airVelocity` already gives is what stays (ADR 0075).
- **A connector is a tree part with a `link`**, not a separate list (ADR 0071): mass, collider, drag, undo, delete and Δv come for free.

## Verification

| Check | Result |
|---|---|
| `bun run test` | 1104 pass, 0 fail (126 files) |
| web vitest | 642 pass, 0 fail |
| `bun run typecheck` (all packages, svelte-check) | 0 errors |
| `bun run build` | done |
| e2e, Chromium only (`smoke.e2e.ts`, `E2E_PORT=5225`, `workers: 1`) | 6 passed, 2.5 min |
| `bun run docs:check` | see the log of the plan (other sessions' rows were missing when this ran) |
| prettier on my files | clean |

Guard tests proven to bite: with the fuel-line source rule removed (`resources.ts`) the two crossfeed tests fail; with the link clearing removed (`vessel.ts`) the strut and fuel-line cut tests fail.

Numbers the criteria asked for:

- **Fuel lines** (two boosters feed the core through lines): the core tank stays at 400 u while the first booster drains at `core + booster` rates; the first booster engine flames out at 225 / (core + booster) = 19.3 s, in the sim (`connectors.test.ts`, within 0.1 s) and in `delta-v.ts` (burn time equal to 1e-9, `delta-v-lines.test.ts`). Without lines the stage ends at 44.1 s.
- **Asparagus ascent, headless** (`asparagus-ascent.test.ts`, four boosters with lines and struts, one reaction wheel): orbit at 76.2 km periapsis, e 0.085; the core tank is at 400 u when the boosters are dry and dropped (39.7 s); the same rocket without lines has less than 150 u left.
- **Tilted parts**: the inertia tensor of a tank turned a quarter turn about Z equals the hand tensor to 1e-9 relative; a 20-degree engine thrusts within 3 degrees of its tilted axis (thrust alone, coast run subtracted); Δv of a canted engine is the straight one times the cosine (1e-9).
- **Wing**: lift slope 4.513 per radian (AR 6, e 0.85), peak `C_L` 1.18 at 15 degrees, `(L/D)max` of the polar 14.2 (found 98 to 100 percent of it on the grid); the 5.9 t craft carries its weight within 3 percent at 194 m/s, and glides at 5.13 against 4.91 predicted from its drag polar (4.5 percent), nose within 1.2 degrees of the air.

## `[manual]` runs (production build, `apps/web/scripts/serve.ts` copy on port 5224, built-in browser, one tab)

- **Asparagus rocket, built in the VAB.** Loaded the booster rocket (23 parts), armed Fuel Line, clicked a booster, selected the core's lower tank with `]` six times and Enter: four fuel lines made at once (the booster group), then the same for the strut: 31 parts. The stage list showed stage 1 at 00:19 burn (it was 00:44 before the lines). A first attempt ended the lines on the upper stage's engine by a mis-click and showed 00:44 again: the lines worked as specified, the target was wrong. Launch, then the sample ascent script edited in the panel (constants for this rocket, radial decouplers fired when all four booster engines have flamed out, the stack decoupler at the cut): `staged at 62.5 s`, `cut: apoapsis 200026 m`, `circularise: dv 1474 m/s`, **`done: periapsis 76931 m`**, orbit at 200 km. Screenshots: `assets/041-vab-asparagus.jpg`, `041-vab-lines.jpg` (orange lines between boosters and core), `041-flight-booster-flameout.jpg`, `041-flight-orbit.jpg`.
- **Glider.** A craft cannot start in the air from the VAB (a vessel launches from the pad), so `packages/sim/test/glider-save.tool.ts` writes a game save of the editor's glider at 7.9 km, 307 m/s over the launch plain's side, which "Load a flight" imported (the file input, from a page script). The craft with its wings flew: T+0:07 pitch -7 degrees, 41 m/s down; **T+0:39 7.31 km, 253 m/s, 1.9 m/s up**, nose at +1 degree, no commands. `assets/041-glider-start.jpg`, `041-glider-glide.jpg`. Pitch settled by the tail, not by the player.
- Frame cost of the bars and the wings was not measured; they are a handful of draw calls (4 bars of 10 segments on the asparagus rocket). Devices other than the M5 are not measured.

## Surprises

- `PartSnapshot`/vessel `velocity` in the snapshot is the root part's velocity, spin included: a test that wants the thrust direction must read the centre of mass velocity (`sim.world.get(id, VESSEL).velocity`).
- The air turns with the planet: a glider placed with a "plain" velocity of 150 m/s relative to the inertial frame at the launch longitude flew at 25 m/s through the air.
- The launch plain is ringed by 3 to 5 km mountains: the glide test flies over a flat terrain (`terrain` option), and the browser run starts at 8 km.
- A radial part's stack child (the booster on its decoupler's `outer` node) has no radial link of its own: the connector pairing walks up to the nearest part that hangs on the target.

## Found, not done

Draft [063](../plans/063-aeroplane-gameplay.md): wheels and a runway, trim and flaps, angle-of-attack and airspeed read-outs, controls for planes. Also: fuel lines are not drawn on the flight HUD's resource list per line (the lists are vessel-wide); a strut has no strength (nothing breaks under load); the editor's `radialAngle` default for keyboard connector picks is 0.

## For the next plan

`apps/web/src/lib/editor/state.ts` has the geometry helpers in `@orbital/core` (`placeRadial`, `placeStack`, `surfacePoint`) for any further attachment kind. A mod that wants lift reports `lift` in `describe`. `ModuleInfo.engine.axis` is read only by `delta-v.ts`.
