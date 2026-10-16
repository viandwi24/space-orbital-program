# Simulation

`@orbital/sim` drives the world. It is a library: `await createSim(options)` returns an object with `step(wallDelta)`, `dispatch(command)` and `snapshot()`, and no knowledge of where it runs (Bun, Worker, main thread). Shipped by plan 007; decisions in ADR 0015 (module capability API), 0016 (design format, protocol) and 0017 (flight model). Code: `packages/sim/src` (`sim.ts` loop and API, `commands.ts`, `vessel.ts`, `frames.ts`, `modes.ts`, `orbit.ts`, `resources.ts`, `hooks.ts`, `snapshot.ts`, `aero.ts`, `thermal.ts`, `atmosphere.ts`, `parts.ts`, `mass.ts`, `state.ts`). Rigid grouping: ADR 0018. Ground contact, landing legs and impact damage: ADR 0019. Debris and time warp: ADR 0021. Re-entry heating: ADR 0023. Radial attachment, part yaw, boosters and fins: ADR 0034 and 0035.

## API

```ts
const sim = await createSim({
  plugins: [Stock],                                 // booted with loadPlugins; needs a root body
  backendFactory: () => createRapierBackend({ solverIterations: 16 }),  // sync or async; called once per flight frame
  seed: 1,                 // PRNG seed (sim.rng); nothing in the sim draws from it yet
  dt: 0.02,                // fixed flight step
  maxFlightFrames: 2,      // physics backends created up front
  maxStepsPerCall: 5000,   // fixed steps per step() call; the rest stays in the accumulator
});
sim.step(wallDelta);       // host time in seconds; scaled by warp
sim.dispatch(command);     // -> { ok: true, vessel? } | { ok: false, reason }; never throws on bad input
sim.snapshot();            // plain data, built on request
sim.world; sim.events; sim.registries; sim.report; sim.rng; sim.time; sim.warp; sim.dispose();
```

`step` adds `wallDelta × warp` to an accumulator. While any vessel is in flight it runs fixed steps of `dt` (one backend step each, per active frame); with every vessel on rails it advances in analytic chunks of at most 10 s. A host that calls `step(0.02)` at warp 1 gets exactly one fixed step per call, which is what the tests do; a render loop passes its frame time. `dispose()` frees the backends (Rapier WASM). The sim never reads a clock.

## Loop

```
accumulator += wallDelta * warp
while accumulator >= dt:
    if any vessel in flight:   flightStep(dt)       # also advances rails vessels' time
    else:                      railsStep(min(accumulator, 10 s))
```

`flightStep`: run `pre-physics` systems; per active frame: mass properties → backend (when a part mass changed), gravity, the ground tile moved under the vessel, every module's `update` (thrust, torque, propellant), drag; `backend.step(dt)`; advance the frame origin; ground contact readback (`landed`, impacts) and damage; re-anchor; refresh vessel poses; apply queued `detach` requests (splits, after the step so no queued force is lost); then `updateOnRails` for rails vessels, `t += dt`, `post-physics` systems, idle bookkeeping and automatic rails transitions.

## Vessel modes

| Mode | What runs |
|---|---|
| **flight** | one compound rigid body per vessel in a flight frame (a box collider per part, plus module colliders), gravity at the centre of mass, drag per part, real ground contact on a ground tile, modules' `update` |
| **on-rails** | centre-of-mass state from the stored Kepler elements (or state vector), attitude frozen, modules' `updateOnRails`, no backend. **Surface rails** (ADR 0024): the pose is stored in the body-fixed frame and turns with the planet |

- flight → on-rails (`modes.ts`): automatically, when no module applied a force or torque for 2 s, the vessel is not in ground contact, and its periapsis radius is above `R + atmosphere.height` (`R` for an airless body). The state is the centre of mass; `kepler.fromStateVector` provides elements, and when it throws `KeplerError` (near-parabolic) the state vector is kept and propagated with `propagateUniversal`. Radial states have periapsis 0 and never go on rails. A `state` placement in a stable orbit is created on rails directly.
- **Debris** (ADR 0021; vessels with no `controlSource` part, `isControlled` in `core.ts`; `modes.ts`: `ballisticEligible`, `reapDebris`): (1) idle for 2 s, not landed, more than 400 m up, not in a stable orbit and either climbing or at/above the atmosphere top -> on rails (`vessel:mode-changed` reason `ballistic debris`); a descending vessel below the atmosphere top stays in flight and crashes with `part:damaged` as in plan 012. (2) On rails and not in a stable orbit, it is destroyed (`vessel:destroyed`, reason `debris re-entered the atmosphere`) when it descends below the atmosphere top or reaches the surface, checked at the end of every step (rails chunks are up to 10 s). (3) In flight, touching its ground tile, idle for 10 s (`DEBRIS_REST_TIME`) and slower than 0.1 m/s relative to the ground (`DEBRIS_REST_SPEED`): destroyed (reason `debris at rest on the surface`). Controlled vessels are never touched. Rails have no drag, hence the cut at the atmosphere top. Limitation: debris circling inside the atmosphere (neither climbing nor above it) stays in flight until drag brings it down.
- **Surface rails** (ADR 0024, plan 016; `modes.ts`: `trackRest`, `surfaceEligible`, `toSurfaceRails`; `orbit.ts`: `surfaceRails`, `orientationOf`): a controlled vessel that is `landed`, had no force or torque, and moves slower than 0.05 m/s and spins slower than 0.01 rad/s relative to the ground for 2 s (`SURFACE_REST_TIME`; `VesselState.rest`) goes on `RailsState` kind `surface` (centre of mass and root orientation in the body-fixed frame; reason `at rest on the ground`). Position is `Ry(omega t) r`, velocity `omega x r`, orientation `Ry(omega t) q`; nothing is integrated, so any warp length is exact. The snapshot has `mode: 'on-rails'`, `surface: true`, the root part's pose and ground-fixed velocity, and no `orbit`. Waking uses the commands below; the body is created at the rails pose with angular velocity `omega`, so it neither falls nor pops. Uncontrolled vessels never get it (debris at rest is removed). Limitation: no colliders on rails, so other vessels pass through a parked one.
- on-rails → flight: a `throttle` > 0, non-zero `attitude`, `stage` or `action` command at warp 1 (the state at time `t` is propagated and bodies are created in a frame). Refused when warp > 1 or no frame is available.
- Elements are re-based (`epoch := t`, `m0` folded) whenever `n·(t − epoch) ≥ 2π`, so long warps keep float64 precision.
- Both transitions emit `vessel:mode-changed` `{ vessel, mode, reason }`. Other events: `vessel:created` `{ vessel, from? }`, `vessel:destroyed`, `stage:activated`, `part:damaged` (ground impact or overheating, below).
- **Launch-site coordinates** (plan 025, ADR 0030; `vessel.ts`: `placeOnSurface`): a `surface` placement's latitude and longitude are **body-fixed**: the inertial position is the body-fixed one turned by `omega * t` about +Y, so a vessel loaded at any time stands on the same ground spot (latitude 0, longitude 0 is the body's +X axis turned with the planet) and the renderer's default launch site matches without inference. Before plan 025 the longitude was inertial and a vessel loaded after about 1 s stood roughly 160 m off.
- **Time warp:** `warp > 1` is refused while any vessel is in flight (the reason names the vessels) and above 1e6; while warping, commands that need flight and `load-vessel` into flight are refused. A controlled vessel idle in a stable orbit reaches rails after two seconds, which is how a player gets to warp. Debris does not hold warp back (ADR 0021, plan 013): see below. A controlled vessel at rest on the ground goes on surface rails after 2 s (ADR 0024, plan 016), so warp works on the pad and after landing.

## Frames and precision

See `units-and-frames.md`. BCI float64 is authoritative; flight runs in a local frame that moves at constant velocity (`bci = origin + local`, velocities relative to `frame.velocity`) and re-anchors when the focus vessel is 1 km from the origin. One frame holds a cluster of vessels (a decoupled stage stays with its parent); a vessel loaded or woken within 2.5 km joins an active frame, otherwise it needs a free one (`maxFlightFrames`).

## Vessel design format (`VesselDesign`, `formatVersion` 1 or 2, ADR 0016 and 0034)

```json
{ "formatVersion": 1, "name": "Two-stage",
  "parts": [
    { "index": 0, "part": "stock.command-pod", "parent": null },
    { "index": 1, "part": "stock.reaction-wheel", "parent": { "index": 0, "parentNode": "bottom", "node": "top" } }
  ],
  "stages": [[6], [4, 3]] }
```

A flat list; `index` is any unique non-negative integer (stable under edits), `parent` names a node of the parent part (`parentNode`) and a node of this part (`node`), `stages[k]` are the indices whose modules' `onStage` runs for the k-th `stage` command (listed order). Validate with `vesselDesignSchema` (shape) and `resolveVesselDesign(design, registries.parts)` (semantics: one root, unique indices, registered parts, resolvable parents, nodes exist and host one attachment, anti-parallel node directions = stack attachment, connected, valid stage references); the latter returns part origins computed from node positions. +Y is the stack axis, the root is the origin. Version 2 (ADR 0034) adds, optionally: a **radial link** `parent: { index, parentNode: "surface", node, radial: { angle, y } }` that hangs the child's horizontal `node` on the side of a cylindrical parent at azimuth `angle` (rad about +Y from the parent's +X) and height `y`, and `symmetry: n` (parts made together share the number; an editing aid the sim ignores). Parts may be turned about +Y only: `ResolvedPart.yaw` is 0 for stack parts (inherited from the parent) and faces the parent's axis for radial parts; thrust axes stay vertical. `migrateVesselDesign` turns version 1 into version 2 unchanged; radial links and `symmetry` in a version 1 design are refused. Example: `{ "index": 10, "part": "stock.radial-decoupler", "parent": { "index": 3, "parentNode": "surface", "node": "radial", "radial": { "angle": 0, "y": 0 } }, "symmetry": 1 }`, then `{ "index": 11, "part": "stock.booster", "parent": { "index": 10, "parentNode": "outer", "node": "radial" } }`.

## Assembly and physics

- A vessel and each part are world entities (`sim.vessel`, `sim.part`, `sim.module-state:<module id>` components, ADR 0010); physics handles live outside the world, in the frame.
- **One rigid body per vessel** (ADR 0018, plan 011): a `compound` shape with one box collider per part (a box `(r, h/2, r)` for cylinder shapes, the shape's box, or 1 m without a shape) at `designPos − root.designPos` (turned by the part's `yaw`); the body origin is the root part's origin, so part poses are `body pose ∘ constant offset`. No joints. Part mass = dry mass + Σ container contents × density; whenever any part mass changed the sim recomputes the vessel's mass, centre of mass and full inertia tensor (parts' own inertia — solid cylinder or box — plus parallel axis; diagonalised by Jacobi into principal moments and a frame, `mass.ts`) and calls `setMass`. A 100-part stack costs one body and about 25 µs of backend time instead of 100 bodies, 99 joints and about 600 µs, and cannot flex.
- Part yaw (ADR 0034): `PartState.yaw` turns a part about the vessel's +Y axis. A part's orientation is the body's times its yaw (snapshots, hook forces, drag), its inertia is rotated about Y, its colliders carry the rotation. Hooks get `vessel.airVelocity(point?)` (ADR 0035): the velocity of a point relative to the co-rotating air, in the part frame, including the vessel's spin; `stock.fin` builds its normal force from it.
- Forces: gravity is one force at the centre of mass, drag is applied per part at its origin, module forces act on the vessel body at the part origin (or the given point); a reaction wheel's torque turns the whole vessel.
- Gravity: `a = −μ r / |r|³` as a force on each body, `μ = G·M` of the root body (point mass). Rotation: `2π / rotationPeriod` about +Y; the launch site and the atmosphere co-rotate.
- Ground (ADR 0019, plan 012): the reference sphere, represented by a **ground tile** per flight vessel whose centre of mass is within 300 m of the surface (dropped again above 400 m): a kinematic 400 x 400 x 200 m slab whose top face is the tangent plane under the centre of mass, re-positioned every step in the local frame and moving with the rotating ground (linear and angular velocity), friction 0.8, restitution 0. A stack stands on it by friction, tips over, slides and rests on legs; no pad hold, no clamp. `landed` is true while the vessel has contact points (distance <= 2 cm) with its tile, which keeps it off rails. `PhysicsBackend.contacts(a, b)` reads the contact points after the step.
- Damage: a part's impact speed is the closing speed of its contact point against the ground along the tile normal, from the velocities before the step in which the contact appears. Above `impactTolerance` (part data, default 6 m/s) the part breaks off (cut from every neighbour with `splitVessel`; it flies on as debris); above twice the tolerance it is destroyed (removed; an emptied vessel is destroyed). Event `part:damaged { vessel, part, definition, speed, outcome }`. The whole rigid body is stopped by the same contact, so the parts above an impacted one are not damaged by the impact itself. Part-to-part collision damage is not modelled.
- Landing legs are module colliders (`ModuleDefinition.colliders`): `stock.landing-legs` adds four feet 2 m from the axis when deployed (`deploy`/`retract`/`toggle` actions, deployed by its stage); the body is rebuilt (same pose and motion) after a dispatched action or stage changes the collider set.
- Heat (ADR 0023, plan 014; `thermal.ts`): every part has a skin temperature (`PartState.temperature`, K, snapshot `PartSnapshot.temperature`). In flight, a part in an airflow receives `k·√(ρ/r_n)·v³` (Sutton-Graves, `k = 1.74e-4`, `r_n` = cylinder radius / half the narrower box side) over the area the flow hits (the drag model's projected areas weighted by `|v_axis|/|v|`; an attached end face is shielded). Modules with `absorbHeat` (the stock heat shield) carry part of that power away first. The skin (3 mm of aluminium, 7 290 J/(m²·K) per surface area) warms and radiates `ε·σ·A·(T⁴ − 288.15⁴)` with ε 0.8, integrated by implicit Euler (stable for any step, so rails vessels cool in 10 s chunks too). A part above `PartDefinition.maxTemperature` (default 1000 K) after the step is cut off and destroyed: `part:damaged { cause: 'overheat', outcome: 'destroyed', temperature }`. Not modelled: conduction between parts, wake, convective cooling, heating on rails (debris on rails is still removed at the atmosphere top, ADR 0021).
- Atmosphere: `p = p0·exp(−h/H)` below the atmosphere height, `ρ = p / (287.05 · 288.15)`. Drag per part and per part-frame axis `−½ρC_d A_i |v_i| v_i`, `C_d = 0.3` unless the part sets `dragCoefficient` (the nose cone: 0.12). Lift comes only from modules (`stock.fin`, ADR 0035): there is no lift on bodies.

## Staging, splitting, resources

- `stage` runs `onStage` on the modules of `stages[nextStage]` and advances the counter. A module may call `ctx.vessel.detach(node, impulse)` (the stock decoupler does); after the hooks the sim cuts that attachment and splits the vessel (in flight: the one body is removed and one body per side is created, each side with the mass-weighted velocity of its parts and the old angular velocity, so momentum and angular momentum are conserved; the order is kept side first, then the new side): the side with a control source keeps the vessel id (the side with the old root if both or neither has one), the other becomes a new vessel (`<name> (debris)`, throttle 0, no stages), and the halves get equal and opposite momentum `impulse` along the node direction (turned by the part's yaw). `detach(node)` cuts every attachment on the node (the reserved `surface` node hosts several). When one stage's hooks queue several detaches (the radial decouplers of four boosters), the cuts are applied as if simultaneous: each impulse is worked out against the vessel as it was before any of them, so boosters leave with equal speeds and the recoils add on the core (`processPending`); one detach is the plain split above.
- Resources are generic (`ResourceStore` modules, `flowMode`, `crossfeed`, ADR 0015): `none` nothing, `vessel` every store on the vessel, `stack` breadth-first from the requesting part never entering a part with `crossfeed: false`, nearest store first. Shortfall is the module's business (stock engines flame out and emit `stock:engine-flameout`).
- Hooks get `ModuleContext` with `vessel: VesselApi` (`plugin-system.md`).

## Snapshots and commands (sim ↔ host protocol)

Types and zod schemas are in `packages/core/src/protocol.ts` and `protocol-schemas.ts`; plain data, so the same protocol works in-process and over `postMessage`.

```ts
interface Snapshot { t: number; vessels: VesselSnapshot[]; bodies: BodySnapshot[] }
interface VesselSnapshot {
  id: EntityId; mode: 'flight' | 'on-rails'; soi: BodyId;
  position: Vec3; velocity: Vec3; orientation: Quat;   // root part origin / velocity / attitude, BCI
  parts: PartSnapshot[];
  orbit?: OrbitalElements;                              // of the centre of mass; absent for near-parabolic/radial
}
interface PartSnapshot { id; definition; position: Vec3; orientation: Quat; modules: Record<string, unknown>; temperature?: number /* K */ }
interface BodySnapshot { id: BodyId; position: Vec3; rotation: Quat }   // rotation = turn about +Y since t = 0
type Command =
  | { type: 'throttle'; vessel; value }            // 0..1
  | { type: 'attitude'; vessel; pitch; yaw; roll } // each -1..1, about body +X, +Z, +Y
  | { type: 'stage'; vessel }
  | { type: 'action'; vessel; part; module; action; args? }   // args array is spread; a single value is wrapped
  | { type: 'warp'; factor }                       // 1..1e6
  | { type: 'load-vessel'; design; placement? };   // surface (default lat 0, lon 0) | state (COM position/velocity, BCI)   // surface latitude/longitude are body-fixed (plan 025)
```

- **Part frame (precise):** `PartSnapshot.position` = part origin − vessel root origin, **in BCI axes** (already rotated by the vessel's attitude, not in the vessel body frame); `PartSnapshot.orientation` = the part's absolute orientation. This is what the renderer applies today (`scene.ts` `syncParts`), so no renderer change was needed. `VesselSnapshot.position` is the root part's origin, not the centre of mass.
- `throttle`, `attitude` and `stage` need a control source (`ModuleDefinition.controlSource`). `dispatch` validates with `commandSchema` and refuses with a reason; semantic refusals cover unknown vessels/parts/modules/actions, exhausted stages, bad designs, warp rules and a missing physics frame.
- A snapshot of the two-stage vessel is about 2.8 kB of JSON and takes about 5 µs to build; a flight step of that vessel costs about 56 µs (Bun, Rapier compat; measured before rigid grouping, a 100-part stack now costs about 145 µs per step, see journal 011), so 50 Hz stepping uses well under 1 % of a core and a snapshot per rendered frame is cheap.

## PhysicsBackend (`packages/core/src/physics-backend.ts`)

Interface in core (additive changes by plan 011: a `compound` `BodyShape`, `MassPlacement` — `centerOfMass`, `inertiaFrame` — in `BodyDesc` and as a fourth `setMass` argument; `getTransform` is the body origin, velocities are the centre of mass's; the sim creates no joints any more but `createFixedJoint` stays in the interface; additive by plan 012: `BodyDesc.friction` / `restitution` and `contacts(a, b)` returning `{ shape, point, distance }` contact points after a step, none in the mock), `@orbital/physics` implements it (`createRapierBackend({ solverIterations? })`, async; `createMockBackend()`). Contract points the sim honours: everything in the local frame; forces last one step, so gravity, thrust, drag and torque are re-applied every step; `Velocity.angular` is about local-frame axes; impulses (decoupler ejection) are applied as direct velocity changes because the backend only has one-step forces. The mock backend ignores joints, collisions and the centre-of-mass offset and is only suitable for hook-level tests.

## Determinism

Fixed `dt`, seeded PRNG, no clock, entity creation and Map iteration orders fixed (ascending ids), Rapier creation/removal order identical: `test/determinism.test.ts` runs a command script (throttle, attitude, a stage that splits the vessel) twice and compares the JSON snapshot and the serialized world at t = 100 s byte for byte. Rapier is deterministic on the same build; cross-machine determinism is not a goal.

## Known limits (MVP)

Rigid vessels (no flex), single root body (no SOI transitions), radial attachment by yaw only (no tilted parts), lift only from fin-like modules, simplified heating (windward area only, no conduction), no terrain heights (the ground is the reference sphere, flat under the vessel), no collision damage between vessels, one physics bubble of 2.5 km (second far vessel in flight is refused), attitude is frozen on rails, reaction-wheel torque acts on the wheel's own body.
