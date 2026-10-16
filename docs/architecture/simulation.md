# Simulation

`@orbital/sim` drives the world. It is a library: `await createSim(options)` returns an object with `step(wallDelta)`, `dispatch(command)` and `snapshot()`, and no knowledge of where it runs (Bun, Worker, main thread). Shipped by plan 007; decisions in ADR 0015 (module capability API), 0016 (design format, protocol) and 0017 (flight model). Code: `packages/sim/src` (`sim.ts` loop and API, `commands.ts`, `vessel.ts`, `frames.ts`, `modes.ts`, `orbit.ts`, `resources.ts`, `hooks.ts`, `snapshot.ts`, `aero.ts`, `atmosphere.ts`, `parts.ts`, `state.ts`).

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

`flightStep`: run `pre-physics` systems; per active frame: masses → backend, gravity, every module's `update` (thrust, torque, propellant), drag; apply queued `detach` requests (splits); `backend.step(dt)`; advance the frame origin; pad hold; ground contact (and destruction of crashed debris); re-anchor; refresh vessel poses; then `updateOnRails` for rails vessels, `t += dt`, `post-physics` systems, idle bookkeeping and automatic rails transitions.

## Vessel modes

| Mode | What runs |
|---|---|
| **flight** | one box body per part in a flight frame, fixed joints per attachment, gravity as a force per body, drag, ground contact, modules' `update` |
| **on-rails** | centre-of-mass state from the stored Kepler elements (or state vector), attitude frozen, modules' `updateOnRails`, no backend |

- flight → on-rails (`modes.ts`): automatically, when no module applied a force or torque for 2 s, the vessel is not in ground contact, and its periapsis radius is above `R + atmosphere.height` (`R` for an airless body). The state is the centre of mass; `kepler.fromStateVector` provides elements, and when it throws `KeplerError` (near-parabolic) the state vector is kept and propagated with `propagateUniversal`. Radial states have periapsis 0 and never go on rails. A `state` placement in a stable orbit is created on rails directly.
- on-rails → flight: a `throttle` > 0, non-zero `attitude`, `stage` or `action` command at warp 1 (the state at time `t` is propagated and bodies are created in a frame). Refused when warp > 1 or no frame is available.
- Elements are re-based (`epoch := t`, `m0` folded) whenever `n·(t − epoch) ≥ 2π`, so long warps keep float64 precision.
- Both transitions emit `vessel:mode-changed` `{ vessel, mode, reason }`. Other events: `vessel:created` `{ vessel, from? }`, `vessel:destroyed`, `stage:activated`.
- **Time warp:** `warp > 1` is refused while any vessel is in flight (the reason names the vessels) and above 1e6; while warping, commands that need flight and `load-vessel` into flight are refused. A controlled vessel idle in a stable orbit reaches rails after two seconds, which is how a player gets to warp.

## Frames and precision

See `units-and-frames.md`. BCI float64 is authoritative; flight runs in a local frame that moves at constant velocity (`bci = origin + local`, velocities relative to `frame.velocity`) and re-anchors when the focus vessel is 1 km from the origin. One frame holds a cluster of vessels (a decoupled stage stays with its parent); a vessel loaded or woken within 2.5 km joins an active frame, otherwise it needs a free one (`maxFlightFrames`).

## Vessel design format (`VesselDesign`, `formatVersion: 1`, ADR 0016)

```json
{ "formatVersion": 1, "name": "Two-stage",
  "parts": [
    { "index": 0, "part": "stock.command-pod", "parent": null },
    { "index": 1, "part": "stock.reaction-wheel", "parent": { "index": 0, "parentNode": "bottom", "node": "top" } }
  ],
  "stages": [[6], [4, 3]] }
```

A flat list; `index` is any unique non-negative integer (stable under edits), `parent` names a node of the parent part (`parentNode`) and a node of this part (`node`), `stages[k]` are the indices whose modules' `onStage` runs for the k-th `stage` command (listed order). Validate with `vesselDesignSchema` (shape) and `resolveVesselDesign(design, registries.parts)` (semantics: one root, unique indices, registered parts, resolvable parents, nodes exist and host one attachment, anti-parallel node directions = stack attachment, connected, valid stage references); the latter returns part origins computed from node positions. All parts share the vessel's axes (no part rotation); +Y is the stack axis, the root is the origin.

## Assembly and physics

- A vessel and each part are world entities (`sim.vessel`, `sim.part`, `sim.module-state:<module id>` components, ADR 0010); physics handles live outside the world, in the frame.
- One rigid body per part: a box `(r, h/2, r)` for cylinder shapes (explicit cylinder inertia), the shape's box, or 1 m without a shape. Mass = dry mass + Σ container contents × density, pushed to the backend whenever it changes. Each attachment is a fixed joint at the nodes. Rigid grouping remains plan 011.
- Gravity: `a = −μ r / |r|³` as a force on each body, `μ = G·M` of the root body (point mass). Rotation: `2π / rotationPeriod` about +Y; the launch site and the atmosphere co-rotate.
- Ground: the reference sphere. A body below it is pushed out and its velocity relative to the rotating ground zeroed. Surface placements are pad-held until thrust exceeds weight. Uncontrolled vessels hitting the ground faster than 10 m/s are destroyed.
- Atmosphere: `p = p0·exp(−h/H)` below the atmosphere height, `ρ = p / (287.05 · 288.15)`. Drag per part and per body axis `−½ρC_d A_i |v_i| v_i`, `C_d = 0.3` (no lift, no fins).

## Staging, splitting, resources

- `stage` runs `onStage` on the modules of `stages[nextStage]` and advances the counter. A module may call `ctx.vessel.detach(node, impulse)` (the stock decoupler does); after the hooks the sim removes that joint and splits the vessel: the side with a control source keeps the vessel id (the side with the old root if both or neither has one), the other becomes a new vessel (`<name> (debris)`, throttle 0, no stages), and the halves get equal and opposite momentum `impulse` along the node direction.
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
interface PartSnapshot { id; definition; position: Vec3; orientation: Quat; modules: Record<string, unknown> }
interface BodySnapshot { id: BodyId; position: Vec3; rotation: Quat }   // rotation = turn about +Y since t = 0
type Command =
  | { type: 'throttle'; vessel; value }            // 0..1
  | { type: 'attitude'; vessel; pitch; yaw; roll } // each -1..1, about body +X, +Z, +Y
  | { type: 'stage'; vessel }
  | { type: 'action'; vessel; part; module; action; args? }   // args array is spread; a single value is wrapped
  | { type: 'warp'; factor }                       // 1..1e6
  | { type: 'load-vessel'; design; placement? };   // surface (default lat 0, lon 0) | state (COM position/velocity, BCI)
```

- **Part frame (precise):** `PartSnapshot.position` = part origin − vessel root origin, **in BCI axes** (already rotated by the vessel's attitude, not in the vessel body frame); `PartSnapshot.orientation` = the part's absolute orientation. This is what the renderer applies today (`scene.ts` `syncParts`), so no renderer change was needed. `VesselSnapshot.position` is the root part's origin, not the centre of mass.
- `throttle`, `attitude` and `stage` need a control source (`ModuleDefinition.controlSource`). `dispatch` validates with `commandSchema` and refuses with a reason; semantic refusals cover unknown vessels/parts/modules/actions, exhausted stages, bad designs, warp rules and a missing physics frame.
- A snapshot of the two-stage vessel is about 2.8 kB of JSON and takes about 5 µs to build; a flight step of that vessel costs about 56 µs (Bun, Rapier compat), so 50 Hz stepping uses well under 1 % of a core and a snapshot per rendered frame is cheap.

## PhysicsBackend (`packages/core/src/physics-backend.ts`)

Unchanged by plan 007: interface in core, `@orbital/physics` implements it (`createRapierBackend({ solverIterations? })`, async; `createMockBackend()`). Contract points the sim honours: everything in the local frame; forces last one step, so gravity, thrust, drag and torque are re-applied every step; `Velocity.angular` is about local-frame axes; impulses (decoupler ejection) are applied as direct velocity changes because the backend only has one-step forces. The mock backend ignores joints and collisions and is only suitable for hook-level tests.

## Determinism

Fixed `dt`, seeded PRNG, no clock, entity creation and Map iteration orders fixed (ascending ids), Rapier creation/removal order identical: `test/determinism.test.ts` runs a command script (throttle, attitude, a stage that splits the vessel) twice and compares the JSON snapshot and the serialized world at t = 100 s byte for byte. Rapier is deterministic on the same build; cross-machine determinism is not a goal.

## Known limits (MVP)

Single root body (no SOI transitions), stack attachments only, no lift/fins/heat, no terrain or landing legs (ground is a sphere), one physics bubble of 2.5 km (second far vessel in flight is refused), attitude is frozen on rails, reaction-wheel torque acts on the wheel's own body.
