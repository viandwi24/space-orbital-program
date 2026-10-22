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
| `propellantMass` | the mass of the propellant mix the burning engines draw, over the whole vessel, kg (ADR 0286): with `mass` and the exhaust velocity, the delta-v left is `ve · ln(mass / (mass − propellantMass))` |
| `nextStage` | what the next `stage` would do (plan 360): `{ drops, ignites }`, the parts its separators cut away and the engines it lights; null when no stage is left, undefined without facts |

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
| `warpTo(time)` | `warp-to` at the highest level the world's warp limits allow (ADR 0286); an engine that lights drops it to physics warp |
| `engage(autopilot, params?)` | `autopilot-engage` on the own vessel: the new autopilot replaces the caller (which ends `disengaged`, "replaced by …"); returns false when it was refused |

`body`, `mass`, `engines` and `propellantMass` come from the sim: inside an autopilot they are always there. A pilot a page builds from a snapshot alone has none (`createVesselPilot(view, id, send, facts?)`).

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
| `guidance.ascent` | `{ altitude?, shape?, inclination? }` | launches, gravity turn east (or on the launch azimuth for `inclination`°, steered closed loop on the inclination error) (pitch `90° · (1 − f^shape)` up to 75 % of the atmosphere), eases off near the target apoapsis, coasts out of the air, circularizes; stages on flame-out, and drops spent boosters (burnt-out solids, liquids with empty tanks) 0.5 s after burnout when the next stage separates them, never crew or a burning engine (plan 360) |
| `guidance.land` | `{ touchdown? }` | burns retrograde until the periapsis is underground, coasts to the suicide-burn height, brakes along a speed profile that ends at the touchdown speed (default 1.2 m/s, 0.5–3), touches down upright |

| `guidance.rendezvous` | `{ standoff?, dock?, warp? }` | flies to the target vessel (or a targeted port's vessel) from anywhere in the same sphere of influence and stops at the set distance (10–200 m, default 150 m) from it, at rest (below). Plan 331, ADR 0286 |

Its panel ("Guidance Computer", plan 332) has a tab per program: **Ascent** (target altitude and inclination, gravity turn), **Orbit** (execute the next node; circularize at an apsis), **Rendezvous**, **Landing** (touchdown speed) and **Log**. Each tab has a status line (what is flying, or why the program cannot start), a progress bar while it flies, its read-outs and its own Engage and Abort; the engaged program's tab opens by itself and is marked ON. `mods/guidance/test` flies all four headless (a 300 m/s node to under 1 m/s, a 100 x 75 km orbit to e < 0.005, the two-stage rocket from the pad to a periapsis above 70 km, a lander down on the moon under 2 m/s).

### Rendezvous (plan 331)

Like MechJeb's rendezvous autopilot. Target a vessel or one of its docking ports, open the Guidance Computer's **Rendezvous** tab and press **Engage**. It needs a burning engine (stage first), and RCS with monopropellant for the last kilometre if you have it. Phases, shown in the tab with the distance, the relative speed, the delta-v used, an estimate of what is still needed and what is left:

1. **plane** — above 0.05° between the two orbit planes, a plane change at the nearer relative node;
2. **phasing** or **transfer** — in the same orbit, a phasing orbit of one or more turns that comes back to the burn point as the target gets there: lower and faster to catch a target ahead, or higher and slower to let it come round, whichever is cheaper, within 10 days (a vessel too low to drop says "Too low to phase: raise your orbit above X km first" with a button to the Orbit tab); otherwise a Hohmann transfer at its phase window, or (when the window is more than 12 orbits away) a Hohmann to the target's height and a circularization, then the phasing; a **course correction** when the predicted closest approach is farther than 2 km (it aims 300 m above the target);
3. **match** — matches the target's velocity 200 m before the closest approach, so the vessel stops beside the target, not in it;
4. **close** — flies the relative velocity toward the target, slowing to a stop at the standoff: the main engine out to 3 km, RCS translation inside 1 km;
5. **hold** — at rest within 200 m until you stop it, press Abort, or engage Auto Dock. With **Dock when close** on and a port targeted, it controls from a free port of the same size and hands over to Auto Dock (`autodock.dock`) itself.

Every far burn is a maneuver node (you see it on the map) flown by the node executor, and coasts longer than two minutes are warped through (to 45 s before the burn, time to wake and turn; once the vessel points along the burn, the rest is warped too, to 5 s before it) (setting **Warp through coasts**; stop the warp and it waits in real time). It aborts when the estimate (plus 10 %) is more than the delta-v left, when fuel and RCS propellant run out, when the vessel loses electric charge, on a collision course it cannot brake out of, and when four transfer plans miss. Settings: **Stop at** 10 to 200 m (default 150; never inside both vessels' sizes plus a few metres, and the hold creeps in to it at 0.1 m/s at most), **Dock when close**, **Warp through coasts**. Before it starts (plan 333) it checks, and says with the numbers: a vessel target, both around one body, the vessel off the ground, its periapsis above the top of the air ("Reach a stable orbit first: periapsis 12 km, needs 70 km+. Circularize at the apoapsis.", with a button to the Orbit tab, or "Fly Ascent." with one to Ascent), and the target on a stable orbit too. While off, the tab shows the HUD's delta-v and an estimate of what the rendezvous needs.

Headless (`mods/guidance/test/rendezvous.test.ts`): 20 km apart in one 100 km orbit, it holds at about 156 m and 0.15 m/s after about 20 m/s; from 100 km to a target at 150 km inclined 2°, about 170 m/s (78 of them for the plane); a nearly dry tank aborts with "Not enough delta-v"; "Dock when close" hands over to Auto Dock.


## Settings, logs and the last run (plan 330, ADR 0285)

- **Settings.** `{ type: 'autopilot-settings', vessel, autopilot, settings }` stores plain values (boolean, number, string) for one autopilot on the vessel. They are saved, and the snapshot shows them as `vessel.autopilotSettings[id]`. `autopilot-engage` passes them to `start`, with the command's `params` on top. Panel options are `select` or `switch` nodes that send this command.
- **Log.** A step may return `log: 'a line'` or several lines. The sim keeps the last 30, each stamped with the seconds since engage. The snapshot shows them as `vessel.autopilot.log`.
- **Last run.** When an autopilot ends, or `autopilot-engage` is refused, the vessel keeps `autopilotLast: { id, title, outcome, reason, time, log }`. `outcome` is `done`, `aborted`, `disengaged` or `refused`. A panel can always say why the last run stopped.

## Mod panel UIs: built-in, or your own

**Built-in** (the default; themed, keyboard-reachable). `definePanel({ view, canvas? })` with these nodes: `section`, `readout`, `meter`, `switch`, `button`, `select` (plan 330), `list` and `sparkline`, plus a 2D canvas. Auto Dock's panel uses `select` for its options, `list` for its log and the canvas for its alignment display (`mods/autodock/src/index.ts`, `display.ts`).

Plan 332 (ADR 0287) adds, for panels with several jobs:

| Node | What it is |
|---|---|
| `{ kind: 'tabs', label, tabs: [{ id, label, badge?(i), children }], active?(i) }` | a v3 tab strip and the open tab's nodes. The open tab is the host's UI state; when `active(i)` names a new tab (a program was engaged) it opens, and it gets an accent dot. `badge` marks a tab (`'ON'`, or null). Every tab is evaluated each update. |
| `{ kind: 'progress', label, value(i), text?(i) }` | a bar, 0..1, with a caption; hidden while both are null |
| `{ kind: 'number', label, unit?, min, max, step?, value(i), command(i, v) }` | a numeric field, clamped and rounded to `step`, sent on Enter or when the field loses focus; typing does not fire flight keys |
| `{ kind: 'notice', text(i), tone?(i), action?(i) }` | one line with a coloured edge: `info`, `warn` (why something is off), `active` (what is flying); hidden when the text is null. `action` (plan 333, ADR 0288) returns `{ label, tab }`: a button that opens that tab |
| button `tone: 'primary' \| 'danger'` | the main action and a stop; toned buttons take one column, so two sit side by side |
| section `columns: 1` | stacks its nodes instead of two per row |

The Guidance Computer's panel is the worked example (`mods/guidance/src/panel.ts`).

The panel input (ADR 0288) also carries `body` (`{ id, radius, mu, atmosphereHeight }` of the active vessel's sphere of influence) and `deltaV` (the HUD stage stack's figure), each null when the host does not know it: a panel can check an orbit and show delta-v without the sim's pilot facts.

**Your own UI.** `definePanel({ ..., custom: { height, source } })`. `source` is the text of an ES module that exports `mount(root, host)`. It runs under the view in an iframe with `sandbox="allow-scripts"` (an opaque origin, no network). Its `host` is:

| Member | What it does |
|---|---|
| `onInput(fn)` | `fn({ time, altitude, speed, vessel, targetVessel })` at every HUD update (plain data) |
| `command(c)` | sends a command; the sim validates it like a button's |
| `resize(px)` | asks for a height (40–600 px) |
| `theme` | the HUD's colours and font: `text`, `dim`, `accent`, `surface`, `button`, `font` (also CSS variables `--text` …) |

```ts
const source = `
export function mount(root, host) {
	root.innerHTML = '<button id="go">Stage</button> <span id="alt"></span>';
	let vessel = null;
	host.onInput((i) => { vessel = i.vessel; root.querySelector('#alt').textContent = Math.round(i.altitude) + ' m'; });
	root.querySelector('#go').onclick = () => vessel && host.command({ type: 'stage', vessel: vessel.id });
}`;
ctx.panels.register(definePanel({ id: 'my-mod.hud', title: 'My HUD', icon: 'gear', order: 900, contexts: ['flight'], view: { kind: 'section', children: [] }, custom: { height: 80, source } }));
```

An error inside the frame shows in the panel ("This panel stopped: …") and nothing else is affected.
