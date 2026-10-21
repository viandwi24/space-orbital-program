# The vessel pilot API and mod autopilots

Plan 310, ADR 0271. This is how a mod (or a host, a panel or a test) flies a vessel: like kRPC's control object or a KSP autopilot. Everything goes through the commands the keys and scripts already send, so the sim checks every call the same way. Auto Dock (`mods/autodock`) is the worked example.

## `VesselPilot`

`createVesselPilot(view, vesselId, send)` from `@orbital/sdk` builds one from a snapshot (`{ t, vessels }`), the vessel id and a command sink. Inside an autopilot the sim builds it for you every step, from fresh snapshots of the vessel and its target vessel, and applies the commands at once.

Read-outs (SI units; inertial axes are the shared axes of `ship.position`):

| Member | What it is |
|---|---|
| `time` | sim time, s |
| `vessel` | the `VesselSnapshot` |
| `controlPart`, `controlOrientation` | the part the vessel is controlled from (the root when none was chosen) and its absolute orientation |
| `controlPort` | that part's `PortSnapshot` when it is a docking port |
| `target`, `targetVessel`, `targetPort` | the target as the sim resolves it, the target vessel's snapshot, the targeted docking port |
| `toLocal(v)`, `toWorld(v)` | inertial ⇄ control-part axes (x right, y forward/nose, z up) |
| `relative()` | `{ position, velocity, localPosition, localVelocity, distance, closing }`: target point minus own point. With a port targeted and a port as control part, both points are the port faces (ADR 0270) |
| `alignment()` | port to port: `{ angle, along, lateral, lateralDistance, distance, closing, velocity, sameSize }`. `angle` rad between the faces (0 = face to face); `along` how far the own face is out in front of the target face along its axis (negative: behind it); `lateral` the offset from that axis; `closing` the speed along it toward the face; `velocity` own minus target |
| `resource(id)` | `{ amount, capacity }` over the vessel, or undefined |
| `body` | `{ id, mu, radius, atmosphereHeight, angularVelocity }` of the sphere-of-influence body (ADR 0277; undefined when the host gave no facts) |
| `mass` | the vessel's current mass, kg (undefined without facts) |
| `engines`, `maxThrust` | each engine module `{ part, thrustVacuum, ispVacuum, ignited, flameout }`; the vacuum thrust of those burning, N |

Controls (each one command; values are clamped):

| Call | Command |
|---|---|
| `sas(mode, reference?)` | `sas` with any SAS mode |
| `pointAt(direction)` | `sas` mode `direction`: the control part's nose along an inertial direction |
| `holdAttitude(q)` | `sas` mode `hold` with `attitude`: turn the control part to orientation `q` and hold it |
| `translate(x, y, z)` | `attitude` with `translate`, in the control part's axes (needs RCS on) |
| `rotate(pitch, yaw, roll)` | `attitude`, a rotation demand in the control part's axes (SAS steps aside while it is not zero) |
| `rcs(on)`, `throttle(v)`, `stage()` | `set-rcs`, `throttle`, `stage` |
| `controlFrom(part \| null)` | `set-control-part` (a command part or a docking port) |
| `setTarget(ref \| null)`, `setTargetPort(vessel, part)` | `target-set` (a whole vessel, a body, or one docking port) |
| `addNode(time, prograde, normal, radial)`, `removeNode(id?)` | `node-set` (a new node) and `node-remove` (ADR 0277) |

`body`, `mass` and `engines` come from the sim: inside an autopilot they are always there. A pilot a page builds from a snapshot alone has none (`createVesselPilot(view, id, send, facts?)`).

`direction` and an attitude `hold` need no particular SAS level: the computer that asks for them does the aiming.

## Autopilots

```ts
import { defineAutopilot, definePlugin } from '@orbital/sdk';

const hover = defineAutopilot<{ goal: number }>({
	id: 'my-mod.station-keep',
	title: 'Station keeping',
	rate: 10, // steps per second of sim time (default 10)
	start(ctrl, params) {
		if (!ctrl.target) throw new Error('set a target first'); // refuses the engage command
		return { goal: (params as { distance?: number })?.distance ?? 50 }; // the memory: plain JSON
	},
	step(ctrl, memory) {
		const rel = ctrl.relative()!;
		const err = rel.distance - memory.goal;
		const v = ctrl.toLocal(rel.velocity);
		ctrl.rcs(true);
		ctrl.translate(-v.x * 4, err * 0.05 - v.y * 4, -v.z * 4);
		return { phase: 'keep', status: `${rel.distance.toFixed(1)} m`, readouts: { error: err } };
	}
});

export default definePlugin({
	meta: { id: 'my-mod', version: '1.0.0', api: '^0.1' },
	setup(ctx) {
		ctx.autopilots.register(hover);
	}
});
```

- Engage with the command `{ type: 'autopilot-engage', vessel, autopilot: 'my-mod.station-keep', params }`, stop with `autopilot-disengage`. A dock panel button (`definePanel`) is the usual UI; scripts call `engage(id, params)`.
- `step` returns `{ phase, status?, readouts?, done?, abort? }`. The vessel snapshot carries `autopilot: { id, title, phase, status, readouts }`.
- The end is the event `autopilot:ended { vessel, autopilot, outcome, reason }` with outcome `done`, `aborted` (an `abort`, a throw, the vessel losing control, the definition not loaded) or `disengaged`. A docking ends the autopilot of both vessels with `done`, `docked`. The sim clears the RCS translation the autopilot left.
- The memory is saved with the vessel and comes back on load. Keep it plain data.
- The autopilot runs in the sim, at its rate on sim time, before the step's physics: it is deterministic and runs headless in `bun test`. Commands it sends follow the signal-delay rule as a script's would.
- It is a *program* (ADR 0276): its commands carry the source `autopilot`, so a control channel the player touches is theirs until 1 s after they let go (`vessel.override` lists them), Delete and Abort stop it, and the status bar lists it. Keep the memory JSON-safe: no `Infinity` or `NaN` (they come back as `null`).

## The Guidance Computer (plan 321)

`mods/guidance` (built in) is the second worked example, with MechJeb-style autopilots on the pilot alone:

| Autopilot | Params | What it does |
|---|---|---|
| `guidance.node` | | points along the next node, lights at half the burn time before it (rocket equation, vacuum Isp), throttles down over the last 1.5 s, removes the node; stages when the engines run dry |
| `guidance.circularize` | `{ at: 'apoapsis' \| 'periapsis' }` | plans a node for the circular speed at that apsis, then burns it like `guidance.node` |
| `guidance.ascent` | `{ altitude?, shape? }` | launches, gravity turn east (pitch `90° · (1 − f^shape)` up to 75 % of the atmosphere), eases off near the target apoapsis, coasts out of the air, circularizes; stages on flame-out |
| `guidance.land` | | burns retrograde until the periapsis is underground, coasts to the suicide-burn height, brakes along a speed profile that ends at 1.2 m/s, touches down upright |

Its panel ("Guidance Computer") engages each one and shows the phase and read-outs. `mods/guidance/test` flies all four headless (a 300 m/s node to under 1 m/s, a 100 x 75 km orbit to e < 0.005, the two-stage rocket from the pad to a periapsis above 70 km, a lander down on the moon under 2 m/s).

